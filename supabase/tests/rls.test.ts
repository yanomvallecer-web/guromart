// Row-level security and data-integrity tests. They run against a disposable
// PostgreSQL database built by scripts/db-test-reset.mjs. Each test runs in a
// transaction that is rolled back, switching between roles the way Supabase
// does (anon, authenticated with a JWT `sub`, service_role).
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const baseUrl = process.env.TEST_DATABASE_URL;
const dbName = process.env.TEST_DATABASE_NAME ?? "guromart_test";

let client: pg.Client;

beforeAll(async () => {
  if (!baseUrl) throw new Error("TEST_DATABASE_URL is not set; run `npm run test:db` after `npm run db:test:reset`.");
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await client.query("begin");
});

afterEach(async () => {
  await client.query("rollback");
});

type Who = { role: "anon" } | { role: "authenticated"; id: string } | { role: "service_role" } | { role: "postgres" };

async function actAs(who: Who) {
  await client.query("reset role");
  if (who.role === "postgres") {
    await client.query("select set_config('request.jwt.claims', '', true)");
    return;
  }
  const claims = who.role === "authenticated" ? { sub: who.id, role: "authenticated" } : { role: who.role };
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await client.query(`set local role ${who.role}`);
}

async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(who: Who, sql: string, params: unknown[] = []) {
  await actAs(who);
  // On error the transaction is aborted; the caller's savepoint rollback
  // restores the role, so only reset it after success.
  const result = await client.query<T>(sql, params);
  await client.query("reset role");
  return result;
}

/** Runs a statement that must fail, inside a savepoint so the test can continue. */
async function expectError(who: Who, sql: string, params: unknown[] = [], pattern?: RegExp) {
  await client.query("savepoint expect_error");
  let error: unknown;
  try {
    await q(who, sql, params);
  } catch (e) {
    error = e;
  }
  await client.query("rollback to savepoint expect_error");
  await client.query("reset role");
  expect(error, `expected failure: ${sql}`).toBeDefined();
  if (pattern) expect(String((error as Error).message)).toMatch(pattern);
}

const admin = { role: "postgres" } as const;
const anon = { role: "anon" } as const;
const user = (id: string) => ({ role: "authenticated", id }) as const;

async function createUser(email: string, name = "Test User") {
  const { rows } = await q<{ id: string }>(
    admin,
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify({ full_name: name })],
  );
  return rows[0].id;
}

async function createSeller(email: string, slug: string, status = "active") {
  const userId = await createUser(email, "Seller");
  const { rows } = await q<{ id: string }>(
    admin,
    "insert into public.seller_accounts (user_id, seller_type, status) values ($1, 'teacher', $2) returning id",
    [userId, status],
  );
  const sellerId = rows[0].id;
  const store = await q<{ id: string }>(
    admin,
    "insert into public.storefronts (seller_account_id, slug, name, is_published) values ($1, $2, 'Test Shop', true) returning id",
    [sellerId, slug],
  );
  await q(admin, "insert into public.user_roles (user_id, role) values ($1, 'seller')", [userId]);
  return { userId, sellerId, storefrontId: store.rows[0].id };
}

async function categoryId() {
  const { rows } = await q<{ id: number }>(admin, "select id from public.product_categories where code = 'worksheet'");
  return rows[0].id;
}

async function insertProduct(who: Who, storefrontId: string, slug: string, extra: Record<string, unknown> = {}) {
  const fields = {
    storefront_id: storefrontId,
    slug,
    title: "Fractions worksheet set",
    category_id: await categoryId(),
    price_centavos: 5000,
    copyright_declared_at: new Date().toISOString(),
    status: "draft",
    ...extra,
  };
  const cols = Object.keys(fields);
  const { rows } = await q<{ id: string; status: string }>(
    who,
    `insert into public.products (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id, status`,
    Object.values(fields),
  );
  return rows[0];
}

/** Gives a listing what it needs to go live: one checked file and one preview. */
async function addReadyMedia(productId: string, sellerId: string, scan = "clean") {
  await q(admin,
    "insert into public.product_files (product_id, storage_path, original_filename, mime_type, file_format, size_bytes, scan_status) values ($1, $2, 'a.pdf', 'application/pdf', 'pdf', 10, $3)",
    [productId, `${sellerId}/${productId}/file.pdf`, scan]);
  await q(admin, "insert into public.product_previews (product_id, storage_path) values ($1, $2)", [productId, `${sellerId}/${productId}/cover.png`]);
}

describe("schema", () => {
  it("enables row-level security on every public table", async () => {
    const { rows } = await q<{ relname: string }>(
      admin,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("creates a profile for every new account", async () => {
    const id = await createUser("teacher@example.test", "Ma'am Liza");
    const { rows } = await q(admin, "select display_name from public.profiles where id = $1", [id]);
    expect(rows[0].display_name).toBe("Ma'am Liza");
  });
});

describe("profiles and roles", () => {
  it("lets anonymous visitors read taxonomy but not profiles", async () => {
    await createUser("someone@example.test");
    const grades = await q(anon, "select count(*)::int as n from public.grade_levels");
    expect(grades.rows[0].n).toBe(14);
    const profiles = await q(anon, "select count(*)::int as n from public.profiles");
    expect(profiles.rows[0].n).toBe(0);
  });

  it("shows a user only their own profile", async () => {
    const a = await createUser("a@example.test");
    await createUser("b@example.test");
    const { rows } = await q(user(a), "select id from public.profiles");
    expect(rows.map((r) => r.id)).toEqual([a]);
  });

  it("does not let a user make themselves an admin", async () => {
    const a = await createUser("a@example.test");
    await expectError(user(a), "insert into public.user_roles (user_id, role) values ($1, 'admin')", [a], /row-level security/);
  });

  it("lets an admin grant roles and records it in the audit log", async () => {
    const boss = await createUser("admin@example.test");
    await q(admin, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [boss]);
    const target = await createUser("seller@example.test");
    await q(user(boss), "insert into public.user_roles (user_id, role) values ($1, 'publisher')", [target]);
    const { rows } = await q(admin, "select actor_id, action from public.audit_logs where entity_id = $1", [target]);
    expect(rows).toEqual([{ actor_id: boss, action: "role.granted" }]);
  });
});

describe("seller accounts", () => {
  it("blocks sellers from changing their own status, plan or strikes", async () => {
    const s = await createSeller("s@example.test", "shop-one", "onboarding");
    await expectError(user(s.userId), "update public.seller_accounts set status = 'active' where id = $1", [s.sellerId], /staff/);
    await expectError(user(s.userId), "update public.seller_accounts set plan = 'pro' where id = $1", [s.sellerId], /staff/);
    await expectError(user(s.userId), "update public.seller_accounts set copyright_strikes = 3 where id = $1", [s.sellerId], /staff/);
    const ok = await q(user(s.userId), "update public.seller_accounts set business_name = 'Liza Prints' where id = $1", [s.sellerId]);
    expect(ok.rowCount).toBe(1);
  });

  it("hides payout details from other users", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await q(user(s.userId), "insert into public.seller_payout_methods (seller_account_id, method, account_name, account_number) values ($1, 'gcash', 'Liza Cruz', '09171234567')", [s.sellerId]);
    const other = await createUser("other@example.test");
    const { rows } = await q(user(other), "select * from public.seller_payout_methods");
    expect(rows).toHaveLength(0);
  });
});

describe("products and moderation", () => {
  it("lets a seller create a draft but not publish it", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const draft = await insertProduct(user(s.userId), s.storefrontId, "fractions-1");
    expect(draft.status).toBe("draft");
    await expectError(user(s.userId), "update public.products set status = 'published' where id = $1", [draft.id], /Sellers cannot move/);
    await expectError(user(s.userId), "update public.products set is_featured = true where id = $1", [draft.id], /staff/);
  });

  it("rejects new products that skip review", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await expectError(user(s.userId), "insert into public.products (storefront_id, slug, title, category_id, status, copyright_declared_at) values ($1, 'x-product', 'Some title', $2, 'published', now())", [s.storefrontId, await categoryId()]);
  });

  it("requires a copyright declaration before review", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const draft = await insertProduct(user(s.userId), s.storefrontId, "fractions-1", { copyright_declared_at: null });
    await expectError(user(s.userId), "update public.products set status = 'pending_review' where id = $1", [draft.id], /check constraint/);
  });

  it("enforces the PHP 30 minimum for paid items", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await expectError(admin, "insert into public.products (storefront_id, slug, title, category_id, price_centavos) values ($1, 'cheap-item', 'Cheap item', $2, 1000)", [s.storefrontId, await categoryId()], /check constraint/);
    const free = await insertProduct(user(s.userId), s.storefrontId, "free-item", { price_centavos: 0 });
    expect(free.id).toBeTruthy();
  });

  it("only shows published products from active sellers to the public", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(user(s.userId), s.storefrontId, "fractions-1", { status: "pending_review" });
    let visible = await q(anon, "select id from public.products");
    expect(visible.rows).toHaveLength(0);

    const boss = await createUser("admin@example.test");
    await q(admin, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [boss]);
    await addReadyMedia(p.id, s.sellerId);
    await q(user(boss), "update public.products set status = 'published' where id = $1", [p.id]);
    visible = await q(anon, "select id, published_at from public.products");
    expect(visible.rows).toHaveLength(1);
    expect(visible.rows[0].published_at).not.toBeNull();

    const audit = await q(admin, "select action, actor_id from public.audit_logs where entity_type = 'product' and entity_id = $1", [p.id]);
    expect(audit.rows).toEqual([{ action: "product.status_changed", actor_id: boss }]);

    await q(admin, "update public.seller_accounts set status = 'suspended' where id = $1", [s.sellerId]);
    visible = await q(anon, "select id from public.products");
    expect(visible.rows).toHaveLength(0);
  });

  it("sends an edited live listing back to review", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published" });
    const { rows } = await q(user(s.userId), "update public.products set title = 'Fractions worksheet set v2' where id = $1 returning status", [p.id]);
    expect(rows[0].status).toBe("pending_review");
  });

  it("does not let one seller edit another seller's product", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const b = await createSeller("b@example.test", "shop-b");
    const p = await insertProduct(user(a.userId), a.storefrontId, "fractions-1");
    const res = await q(user(b.userId), "update public.products set title = 'Hijacked title' where id = $1", [p.id]);
    expect(res.rowCount).toBe(0);
    await expectError(user(b.userId), "insert into public.products (storefront_id, slug, title, category_id) values ($1, 'sneaky', 'Sneaky item', $2)", [a.storefrontId, await categoryId()], /row-level security/);
  });

  it("keeps product file paths away from buyers", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published" });
    await q(admin, "insert into public.product_files (product_id, storage_path, original_filename, mime_type, file_format, size_bytes) values ($1, 'x/y/z.pdf', 'z.pdf', 'application/pdf', 'pdf', 1000)", [p.id]);
    const buyer = await createUser("buyer@example.test");
    expect((await q(user(buyer), "select * from public.product_files")).rows).toHaveLength(0);
    expect((await q(anon, "select * from public.product_files")).rows).toHaveLength(0);
    expect((await q(user(s.userId), "select * from public.product_files")).rows).toHaveLength(1);
  });

  it("finds published products by full-text search", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published", topic: "Adding dissimilar fractions" });
    await insertProduct(admin, s.storefrontId, "photosynthesis", { status: "published", title: "Photosynthesis lab sheet" });
    const { rows } = await q(anon, "select slug from public.products where search_vector @@ websearch_to_tsquery('simple', 'dissimilar fractions')");
    expect(rows.map((r) => r.slug)).toEqual(["fractions-1"]);
  });
});

describe("transactions", () => {
  it("does not let buyers create orders, payments or entitlements themselves", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published" });
    const buyer = await createUser("buyer@example.test");
    await expectError(user(buyer), "insert into public.orders (user_id, subtotal_centavos, total_centavos, status) values ($1, 0, 0, 'paid')", [buyer], /row-level security/);
    await expectError(user(buyer), "insert into public.entitlements (user_id, product_id, source) values ($1, $2, 'grant')", [buyer, p.id], /row-level security/);
  });

  it("only allows published products in a cart", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const live = await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published" });
    const draft = await insertProduct(admin, s.storefrontId, "fractions-2");
    const buyer = await createUser("buyer@example.test");
    const cart = await q(user(buyer), "insert into public.carts (user_id) values ($1) returning id", [buyer]);
    const cartId = cart.rows[0].id;
    await q(user(buyer), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, live.id]);
    await expectError(user(buyer), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, draft.id], /not available/);
  });

  it("requires the split to add up and keeps the ledger append-only", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published" });
    const buyer = await createUser("buyer@example.test");
    const order = await q(admin, "insert into public.orders (user_id, subtotal_centavos, total_centavos) values ($1, 5000, 5000) returning id, order_number", [buyer]);
    expect(order.rows[0].order_number).toMatch(/^GM-\d+$/);
    await expectError(admin, "insert into public.order_items (order_id, product_id, seller_account_id, title_snapshot, license_type_snapshot, unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos) values ($1, $2, $3, 't', 'single_teacher', 5000, 3000, 1500, 3000)", [order.rows[0].id, p.id, s.sellerId], /check constraint/);
    const item = await q(admin, "insert into public.order_items (order_id, product_id, seller_account_id, title_snapshot, license_type_snapshot, unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos) values ($1, $2, $3, 't', 'single_teacher', 5000, 3000, 1500, 3500) returning id", [order.rows[0].id, p.id, s.sellerId]);
    const entry = await q(admin, "insert into public.seller_ledger_entries (seller_account_id, entry_type, amount_centavos, order_item_id) values ($1, 'sale', 3500, $2) returning id", [s.sellerId, item.rows[0].id]);
    await expectError(admin, "update public.seller_ledger_entries set amount_centavos = 9999 where id = $1", [entry.rows[0].id], /append-only/);
    await expectError(admin, "insert into public.seller_ledger_entries (seller_account_id, entry_type, amount_centavos, order_item_id) values ($1, 'sale', 3500, $2)", [s.sellerId, item.rows[0].id], /duplicate key/);

    const balance = await q(user(s.userId), "select balance_centavos from public.seller_balances");
    expect(Number(balance.rows[0].balance_centavos)).toBe(3500);
    const otherSeller = await createSeller("t@example.test", "shop-two");
    expect((await q(user(otherSeller.userId), "select * from public.seller_balances")).rows).toHaveLength(0);
    expect((await q(user(buyer), "select * from public.seller_ledger_entries")).rows).toHaveLength(0);
  });

  it("records each payment webhook event only once", async () => {
    const sql = "insert into public.payment_events (provider, provider_event_id, event_type, payload) values ('paymongo', 'evt_1', 'checkout_session.payment.paid', '{}') on conflict (provider, provider_event_id) do nothing returning id";
    expect((await q({ role: "service_role" }, sql)).rowCount).toBe(1);
    expect((await q({ role: "service_role" }, sql)).rowCount).toBe(0);
  });
});

describe("reviews", () => {
  it("only lets buyers who own a resource review it, and updates the rating", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(admin, s.storefrontId, "fractions-1", { status: "published", price_centavos: 0 });
    const buyer = await createUser("buyer@example.test");
    await expectError(user(buyer), "insert into public.reviews (product_id, user_id, rating) values ($1, $2, 5)", [p.id, buyer], /row-level security/);

    await q(admin, "insert into public.entitlements (user_id, product_id, source) values ($1, $2, 'free')", [buyer, p.id]);
    await q(user(buyer), "insert into public.reviews (product_id, user_id, rating, body) values ($1, $2, 4, 'Useful for Q2')", [p.id, buyer]);
    const { rows } = await q(anon, "select rating_avg::float as avg, rating_count from public.products where id = $1", [p.id]);
    expect(rows[0]).toEqual({ avg: 4, rating_count: 1 });

    await expectError(user(s.userId), "insert into public.reviews (product_id, user_id, rating) values ($1, $2, 5)", [p.id, s.userId], /row-level security/);
  });
});

describe("storage", () => {
  it("lets sellers upload only into their own folder", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const other = await createSeller("o@example.test", "shop-two");
    await q(user(s.userId), "insert into storage.objects (bucket_id, name) values ('product-files', $1)", [`${s.sellerId}/p1/file.pdf`]);
    await expectError(user(s.userId), "insert into storage.objects (bucket_id, name) values ('product-files', $1)", [`${other.sellerId}/p1/file.pdf`], /row-level security/);
    const buyer = await createUser("buyer@example.test");
    expect((await q(user(buyer), "select * from storage.objects where bucket_id = 'product-files'")).rows).toHaveLength(0);
  });
});

describe("start_selling", () => {
  const call = "select public.start_selling('teacher', 'Ma''am Liza Prints', 'liza-prints', true) as storefront_id";

  it("creates a seller account, storefront and seller role for the caller", async () => {
    const u = await createUser("liza@example.test");
    const { rows } = await q(user(u), call);
    expect(rows[0].storefront_id).toBeTruthy();
    const roles = await q(user(u), "select role from public.user_roles");
    expect(roles.rows.map((r) => r.role)).toEqual(["seller"]);
    const account = await q(user(u), "select status, plan, onboarding_step from public.seller_accounts");
    expect(account.rows[0]).toEqual({ status: "onboarding", plan: "starter", onboarding_step: 4 });
    // Not public until the seller is active and publishes the shop.
    expect((await q(anon, "select * from public.storefronts")).rows).toHaveLength(0);
  });

  it("refuses anonymous callers, a second account, taken slugs and missing consent", async () => {
    await expectError(anon, call, [], /permission denied/);
    const u = await createUser("liza@example.test");
    await expectError(user(u), "select public.start_selling('teacher', 'Shop', 'liza-prints', false)", [], /seller terms/);
    await q(user(u), call);
    await expectError(user(u), "select public.start_selling('teacher', 'Another', 'another-shop', true)", [], /already have/);
    const v = await createUser("other@example.test");
    await expectError(user(v), call, [], /taken/);
  });
});

describe("file format summary", () => {
  it("follows the product's files and cannot be set by sellers", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const p = await insertProduct(user(s.userId), s.storefrontId, "fractions-1");
    await q(user(s.userId), "insert into public.product_files (product_id, storage_path, original_filename, mime_type, file_format, size_bytes) values ($1, $2, 'c.pdf', 'application/pdf', 'pdf', 10), ($1, $3, 'd.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 10)", [p.id, `${s.sellerId}/${p.id}/c.pdf`, `${s.sellerId}/${p.id}/d.docx`]);
    const { rows } = await q(user(s.userId), "select file_formats from public.products where id = $1", [p.id]);
    expect(rows[0].file_formats).toEqual(["docx", "pdf"]);
    await expectError(user(s.userId), "update public.products set file_formats = '{zip}' where id = $1", [p.id], /staff/);
  });
});

describe("listing media guards", () => {
  const fileSql = "insert into public.product_files (product_id, storage_path, original_filename, mime_type, file_format, size_bytes) values ($1, $2, 'a.pdf', 'application/pdf', 'pdf', 10)";

  it("only accepts files from the seller's own folder for that listing", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const b = await createSeller("b@example.test", "shop-b");
    const pa = await insertProduct(user(a.userId), a.storefrontId, "fractions-a");
    const pb = await insertProduct(user(b.userId), b.storefrontId, "fractions-b");
    await q(user(a.userId), fileSql, [pa.id, `${a.sellerId}/${pa.id}/x.pdf`]);
    await expectError(user(a.userId), fileSql, [pa.id, `${b.sellerId}/${pb.id}/x.pdf`], /does not belong/);
    await expectError(user(a.userId), fileSql, [pa.id, `${a.sellerId}/${pb.id}/x.pdf`], /does not belong/);
  });

  it("freezes files on a live listing", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const p = await insertProduct(admin, a.storefrontId, "fractions-a", { status: "published" });
    await expectError(user(a.userId), fileSql, [p.id, `${a.sellerId}/${p.id}/x.pdf`], /Withdraw/);
  });

  it("caps files per listing", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const p = await insertProduct(user(a.userId), a.storefrontId, "fractions-a");
    for (let i = 0; i < 10; i++) await q(user(a.userId), fileSql, [p.id, `${a.sellerId}/${p.id}/${i}.pdf`]);
    await expectError(user(a.userId), fileSql, [p.id, `${a.sellerId}/${p.id}/11.pdf`], /at most 10/);
  });
});

describe("listing review", () => {
  async function setup(sellerStatus = "onboarding") {
    const s = await createSeller("s@example.test", "shop-one", sellerStatus);
    await q(admin, "update public.storefronts set is_published = false where id = $1", [s.storefrontId]);
    const p = await insertProduct(user(s.userId), s.storefrontId, "fractions-1", { status: "pending_review" });
    const boss = await createUser("admin@example.test");
    await q(admin, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [boss]);
    return { s, p, boss };
  }

  it("won't publish a listing until every file is checked clean", async () => {
    const { s, p, boss } = await setup();
    await expectError(user(boss), "select public.review_listing($1, true)", [p.id], /at least one file/);
    await addReadyMedia(p.id, s.sellerId, "pending");
    await expectError(user(boss), "select public.review_listing($1, true)", [p.id], /checked and marked clean/);
    // The rule holds for direct updates too, not just the review function.
    await expectError(user(boss), "update public.products set status = 'published' where id = $1", [p.id], /checked and marked clean/);
  });

  it("lets staff mark files, then approve: the listing, seller and shop go live and the seller is told", async () => {
    const { s, p, boss } = await setup();
    await addReadyMedia(p.id, s.sellerId, "pending");
    // Sellers can't mark their own files: RLS gives them no rows to update.
    const sellerTry = await q(user(s.userId), "update public.product_files set scan_status = 'clean' where product_id = $1 returning id", [p.id]);
    expect(sellerTry.rows).toHaveLength(0);
    await expectError(user(boss), "update public.product_files set storage_path = 'elsewhere/x.pdf' where product_id = $1", [p.id], /Only the file check result/);
    await q(user(boss), "update public.product_files set scan_status = 'clean' where product_id = $1", [p.id]);

    const { rows } = await q(user(boss), "select public.review_listing($1, true) as status", [p.id]);
    expect(rows[0].status).toBe("published");
    const live = await q(anon, "select id from public.products where id = $1", [p.id]);
    expect(live.rows).toHaveLength(1);
    const note = await q(admin, "select type, link_path from public.notifications where user_id = $1", [s.userId]);
    expect(note.rows).toEqual([{ type: "listing.approved", link_path: `/seller/products/${p.id}` }]);
    const audit = await q(admin, "select action from public.audit_logs where actor_id = $1 order by id", [boss]);
    expect(audit.rows.map((r) => r.action)).toEqual(["product_file.scan_marked", "product.status_changed", "seller.activated"]);
  });

  it("requires a reason to reject and shows it to the seller", async () => {
    const { s, p, boss } = await setup("active");
    await expectError(user(boss), "select public.review_listing($1, false, 'no')", [p.id], /what to fix/);
    await q(user(boss), "select public.review_listing($1, false, $2)", [p.id, "The preview shows a copyrighted textbook page."]);
    const { rows } = await q(user(s.userId), "select status, rejection_reason from public.products where id = $1", [p.id]);
    expect(rows[0]).toEqual({ status: "rejected", rejection_reason: "The preview shows a copyrighted textbook page." });
    await expectError(user(boss), "select public.review_listing($1, true)", [p.id], /not waiting for review/);
  });

  it("is staff-only", async () => {
    const { s, p } = await setup();
    await addReadyMedia(p.id, s.sellerId);
    await expectError(user(s.userId), "select public.review_listing($1, true)", [p.id], /Only GuroMart staff/);
    await expectError(anon, "select public.review_listing($1, true)", [p.id], /permission denied/);
  });
});

describe("seller verification and payouts", () => {
  const submit = "insert into public.seller_verifications (seller_account_id, kind, document_path) values ($1, 'government_id', $2) returning id";

  async function staff() {
    const boss = await createUser("admin@example.test");
    await q(admin, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [boss]);
    return boss;
  }

  it("takes one request at a time from the seller's own folder and marks the account pending", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const b = await createSeller("b@example.test", "shop-b");
    await expectError(user(a.userId), submit, [a.sellerId, `${b.sellerId}/id.pdf`], /does not belong/);
    await expectError(user(a.userId), submit, [b.sellerId, `${b.sellerId}/id.pdf`]);
    await q(user(a.userId), submit, [a.sellerId, `${a.sellerId}/id.pdf`]);
    await expectError(user(a.userId), submit, [a.sellerId, `${a.sellerId}/id2.pdf`], /duplicate key/);
    const { rows } = await q(user(a.userId), "select verification_status from public.seller_accounts where id = $1", [a.sellerId]);
    expect(rows[0].verification_status).toBe("pending");
    // Sellers can't approve themselves, directly or through the function.
    const self = await q(user(a.userId), "update public.seller_verifications set status = 'verified' where seller_account_id = $1 returning id", [a.sellerId]);
    expect(self.rows).toHaveLength(0);
    await expectError(user(a.userId), "select public.review_verification(id, true) from public.seller_verifications where seller_account_id = $1", [a.sellerId], /Only GuroMart staff/);
  });

  it("lets staff reject with a note, then verify a new request", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const boss = await staff();
    const first = await q(user(a.userId), submit, [a.sellerId, `${a.sellerId}/blurry.jpg`]);
    await expectError(user(boss), "select public.review_verification($1, false, 'no')", [first.rows[0].id], /what to fix/);
    await q(user(boss), "select public.review_verification($1, false, $2)", [first.rows[0].id, "The photo is blurry; please retake it in good light."]);
    let account = await q(user(a.userId), "select verification_status from public.seller_accounts where id = $1", [a.sellerId]);
    expect(account.rows[0].verification_status).toBe("rejected");

    const second = await q(user(a.userId), submit, [a.sellerId, `${a.sellerId}/clear.jpg`]);
    await q(user(boss), "select public.review_verification($1, true)", [second.rows[0].id]);
    account = await q(user(a.userId), "select verification_status from public.seller_accounts where id = $1", [a.sellerId]);
    expect(account.rows[0].verification_status).toBe("verified");
    await expectError(user(boss), "select public.review_verification($1, true)", [second.rows[0].id], /already been reviewed/);
    const notes = await q(admin, "select type from public.notifications where user_id = $1 order by created_at", [a.userId]);
    expect(notes.rows.map((r) => r.type).sort()).toEqual(["verification.approved", "verification.rejected"]);
  });

  it("keeps payout details private to the seller and staff, checks wallet numbers and audits changes", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const b = await createSeller("b@example.test", "shop-b");
    const add = "insert into public.seller_payout_methods (seller_account_id, method, account_name, account_number, bank_name) values ($1, $2, 'Liza Cruz', $3, $4)";
    await expectError(user(a.userId), add, [a.sellerId, "gcash", "12345678", null], /wallet_number/);
    await expectError(user(b.userId), add, [a.sellerId, "gcash", "09171234567", null]);
    await q(user(a.userId), add, [a.sellerId, "gcash", "0917 123 4567", null]);
    const seen = await q(user(b.userId), "select id from public.seller_payout_methods");
    expect(seen.rows).toHaveLength(0);
    const audit = await q(admin, "select action, metadata->>'account_last4' as last4 from public.audit_logs where entity_id = $1 and action like 'seller.payout%'", [a.sellerId]);
    expect(audit.rows).toEqual([{ action: "seller.payout_method_insert", last4: "4567" }]);
  });
});

describe("shop profile", () => {
  it("lets a seller edit their own shop but not its address, owner or someone else's images", async () => {
    const a = await createSeller("a@example.test", "shop-a");
    const b = await createSeller("b@example.test", "shop-b");
    await q(user(a.userId), "update public.storefronts set name = 'Ma''am Liza Prints', tagline = 'Grade 4 science', logo_path = $2 where id = $1", [a.storefrontId, `${a.sellerId}/logo.png`]);
    const { rows } = await q(anon, "select name, tagline, logo_path from public.storefronts where id = $1", [a.storefrontId]);
    expect(rows[0]).toEqual({ name: "Ma'am Liza Prints", tagline: "Grade 4 science", logo_path: `${a.sellerId}/logo.png` });

    await expectError(user(a.userId), "update public.storefronts set slug = 'new-address' where id = $1", [a.storefrontId], /cannot be changed/);
    await expectError(user(a.userId), "update public.storefronts set seller_account_id = $2 where id = $1", [a.storefrontId, b.sellerId], /cannot be changed|duplicate/);
    await expectError(user(a.userId), "update public.storefronts set banner_path = $2 where id = $1", [a.storefrontId, `${b.sellerId}/banner.png`], /own folder/);
    const other = await q(user(a.userId), "update public.storefronts set name = 'Hijacked' where id = $1 returning id", [b.storefrontId]);
    expect(other.rows).toHaveLength(0);
  });
});

describe("shop visibility after approval", () => {
  it("keeps a shop hidden when an active seller chose to hide it", async () => {
    const s = await createSeller("s@example.test", "shop-one", "active");
    await q(user(s.userId), "update public.storefronts set is_published = false where id = $1", [s.storefrontId]);
    const p = await insertProduct(user(s.userId), s.storefrontId, "fractions-1", { status: "pending_review" });
    await addReadyMedia(p.id, s.sellerId);
    const boss = await createUser("admin@example.test");
    await q(admin, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [boss]);
    await q(user(boss), "select public.review_listing($1, true)", [p.id]);
    const { rows } = await q(admin, "select is_published from public.storefronts where id = $1", [s.storefrontId]);
    expect(rows[0].is_published).toBe(false);
  });
});

describe("ranked search", () => {
  async function publish(storefrontId: string, slug: string, title: string, extra: Record<string, unknown> = {}) {
    return insertProduct(admin, storefrontId, slug, { title, status: "published", ...extra });
  }
  const search = (text: string | null, sort = "relevance", extra = "") =>
    q(anon, `select b.id, b.total, p.title from public.browse_product_ids(p_q => $1, p_sort => $2${extra}) b join public.products p on p.id = b.id`, [text, sort]);

  it("ranks title matches first and widens queries with synonyms", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await publish(s.storefrontId, "item-a", "Science reviewer", { description: "Includes a daily lesson log for week 2." });
    await publish(s.storefrontId, "item-b", "Daily lesson log for Grade 4 Science");
    await publish(s.storefrontId, "item-c", "Fractions worksheet");

    const dll = await search("DLL");
    expect(dll.rows.map((r) => r.title)).toEqual(["Daily lesson log for Grade 4 Science", "Science reviewer"]);
    expect(Number(dll.rows[0].total)).toBe(2);

    const agham = await search("agham");
    expect(agham.rows.map((r) => r.title).sort()).toEqual(["Daily lesson log for Grade 4 Science", "Science reviewer"]);
  });

  it("treats each listed synonym as an alternative", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await publish(s.storefrontId, "item-m", "Grade 6 Mathematics reviewer");
    await publish(s.storefrontId, "item-q", "Science quiz for Grade 4");
    expect((await search("matematika")).rows.map((r) => r.title)).toEqual(["Grade 6 Mathematics reviewer"]);
    expect((await search("pagsusulit")).rows.map((r) => r.title)).toEqual(["Science quiz for Grade 4"]);
  });

  it("tolerates typos in titles", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    await publish(s.storefrontId, "item-c", "Fractions worksheet");
    const { rows } = await search("fractoins");
    expect(rows.map((r) => r.title)).toEqual(["Fractions worksheet"]);
  });

  it("applies filters and only returns live listings", async () => {
    const s = await createSeller("s@example.test", "shop-one");
    const other = await createSeller("o@example.test", "shop-two", "suspended");
    await publish(s.storefrontId, "item-free", "Free science sheet", { price_centavos: 0 });
    await publish(s.storefrontId, "item-paid", "Paid science sheet", { price_centavos: 15000 });
    await insertProduct(admin, s.storefrontId, "item-draft", { title: "Draft science sheet" });
    await publish(other.storefrontId, "item-hidden", "Hidden science sheet");

    const all = await search("science", "price_asc");
    expect(all.rows.map((r) => r.title)).toEqual(["Free science sheet", "Paid science sheet"]);
    const paid = await search("science", "relevance", ", p_price_min => 1");
    expect(paid.rows.map((r) => r.title)).toEqual(["Paid science sheet"]);
    const shop = await search(null, "newest", ", p_shop => 'shop-two'");
    expect(shop.rows).toHaveLength(0);
  });
});

describe("cart, free resources and library", () => {
  async function setup() {
    const s = await createSeller("s@example.test", "shop-one");
    const paid = await insertProduct(admin, s.storefrontId, "paid-1", { status: "published", price_centavos: 7500 });
    const free = await insertProduct(admin, s.storefrontId, "free-1", { status: "published", price_centavos: 0 });
    await addReadyMedia(paid.id, s.sellerId);
    await addReadyMedia(free.id, s.sellerId);
    const buyer = await createUser("buyer@example.test");
    const cart = await q(user(buyer), "insert into public.carts (user_id) values ($1) returning id", [buyer]);
    const fileOf = async (productId: string) =>
      (await q<{ id: string }>(admin, "select id from public.product_files where product_id = $1", [productId])).rows[0].id;
    return { s, paid, free, buyer, cartId: cart.rows[0].id as string, fileOf };
  }
  const addToCart = (who: string, cartId: string, productId: string) =>
    q(user(who), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, productId]);

  it("only takes paid resources the buyer neither sells nor owns", async () => {
    const { s, paid, free, buyer, cartId } = await setup();
    await addToCart(buyer, cartId, paid.id);
    await expectError(user(buyer), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, free.id], /is free/);

    const sellerCart = await q(user(s.userId), "insert into public.carts (user_id) values ($1) returning id", [s.userId]);
    await expectError(user(s.userId), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [sellerCart.rows[0].id, paid.id], /your own/);

    const other = await createUser("other@example.test");
    await expectError(user(other), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, paid.id], /row-level security/);
  });

  it("refuses resources already in the library", async () => {
    const { paid, buyer, cartId } = await setup();
    await q(admin, "insert into public.entitlements (user_id, product_id, source) values ($1, $2, 'grant')", [buyer, paid.id]);
    await expectError(user(buyer), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, paid.id], /already in your library/);
  });

  it("grants free resources once and never paid ones", async () => {
    const { paid, free, buyer } = await setup();
    const first = await q(user(buyer), "select public.claim_free_product($1) as id", [free.id]);
    const again = await q(user(buyer), "select public.claim_free_product($1) as id", [free.id]);
    expect(again.rows[0].id).toBe(first.rows[0].id);
    await expectError(user(buyer), "select public.claim_free_product($1)", [paid.id], /not free/);
    await expectError(anon, "select public.claim_free_product($1)", [free.id], /permission denied/);

    const draft = await insertProduct(admin, (await q(admin, "select storefront_id from public.products where id = $1", [free.id])).rows[0].storefront_id, "free-draft", { price_centavos: 0 });
    await expectError(user(buyer), "select public.claim_free_product($1)", [draft.id], /not available/);
  });

  it("only lets owners download, logs it and counts each teacher once", async () => {
    const { paid, free, buyer, fileOf } = await setup();
    const paidFile = await fileOf(paid.id);
    const freeFile = await fileOf(free.id);
    await expectError(user(buyer), "select * from public.start_download($1)", [paidFile], /don't have access/);

    await q(user(buyer), "select public.claim_free_product($1)", [free.id]);
    const dl = await q(user(buyer), "select * from public.start_download($1)", [freeFile]);
    expect(dl.rows[0].storage_path).toContain(free.id);
    await q(user(buyer), "select * from public.start_download($1)", [freeFile]);

    const logged = await q(user(buyer), "select count(*)::int as n from public.downloads");
    expect(logged.rows[0].n).toBe(2);
    const count = await q(admin, "select download_count from public.products where id = $1", [free.id]);
    expect(count.rows[0].download_count).toBe(1);

    const other = await createUser("other@example.test");
    expect((await q(user(other), "select * from public.downloads")).rows).toHaveLength(0);
    expect((await q(user(other), "select * from public.my_library()")).rows).toHaveLength(0);
  });

  it("keeps archived resources in the library and blocks revoked access", async () => {
    const { s, free, buyer, fileOf } = await setup();
    await q(user(buyer), "select public.claim_free_product($1)", [free.id]);
    await q(user(s.userId), "update public.products set status = 'archived' where id = $1", [free.id]);

    const lib = await q(user(buyer), "select * from public.my_library()");
    expect(lib.rows).toHaveLength(1);
    expect(lib.rows[0].is_live).toBe(false);
    expect(lib.rows[0].files[0]).toMatchObject({ format: "pdf", available: true });
    await q(user(buyer), "select * from public.start_download($1)", [await fileOf(free.id)]);

    await q(admin, "update public.entitlements set revoked_at = now(), revoke_reason = 'takedown' where user_id = $1", [buyer]);
    await expectError(user(buyer), "select * from public.start_download($1)", [await fileOf(free.id)], /don't have access/);
    expect((await q(user(buyer), "select * from public.my_library()")).rows).toHaveLength(0);
  });

  it("removes a claimed free resource from the cart", async () => {
    const { free, buyer, cartId } = await setup();
    await q(admin, "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, free.id]);
    await q(user(buyer), "select public.claim_free_product($1)", [free.id]);
    expect((await q(user(buyer), "select * from public.cart_items")).rows).toHaveLength(0);
  });
});

describe("checkout and payment events", () => {
  const service = { role: "service_role" } as const;
  async function setup(plan = "starter") {
    const s = await createSeller("s@example.test", "shop-one");
    await q(admin, "update public.seller_accounts set plan = $2 where id = $1", [s.sellerId, plan]);
    const a = await insertProduct(admin, s.storefrontId, "paid-a", { status: "published", price_centavos: 7500, title: "Science reviewer" });
    const b = await insertProduct(admin, s.storefrontId, "paid-b", { status: "published", price_centavos: 15000, title: "Math test" });
    const buyer = await createUser("buyer@example.test");
    const cart = await q(user(buyer), "insert into public.carts (user_id) values ($1) returning id", [buyer]);
    for (const p of [a, b]) await q(user(buyer), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cart.rows[0].id, p.id]);
    return { s, a, b, buyer };
  }
  async function checkout(buyer: string, checkoutId = "cs_test_1") {
    const order = (await q(user(buyer), "select * from public.create_order_from_cart()")).rows[0];
    await q(service, "insert into public.payments (order_id, provider, provider_checkout_id, amount_centavos) values ($1, 'paymongo', $2, $3)",
      [order.order_id, checkoutId, order.total_centavos]);
    return order;
  }
  const paid = (eventId: string, checkoutId: string, amount: number, livemode = false) =>
    q(service, "select public.apply_payment_event($1, 'checkout_session.payment.paid', '{}'::jsonb, $2, $3, $5, $4, 500, 'gcash') as outcome",
      [eventId, livemode, checkoutId, amount, `pay_${eventId}`]);

  it("snapshots prices and commission when the order is created", async () => {
    const { buyer } = await setup();
    const order = await checkout(buyer);
    expect(order.total_centavos).toBe(22500);
    const items = await q(user(buyer), "select unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos from public.order_items order by unit_price_centavos");
    expect(items.rows).toEqual([
      { unit_price_centavos: 7500, commission_bps: 3000, platform_fee_centavos: 2250, seller_earnings_centavos: 5250 },
      { unit_price_centavos: 15000, commission_bps: 3000, platform_fee_centavos: 4500, seller_earnings_centavos: 10500 },
    ]);
    expect((await q(user(buyer), "select status from public.orders")).rows[0].status).toBe("pending_payment");
    expect((await q(user(buyer), "select * from public.entitlements")).rows).toHaveLength(0);
  });

  it("uses the Pro rate and a negotiated override", async () => {
    const { s, buyer } = await setup("pro");
    await checkout(buyer);
    expect((await q(user(buyer), "select distinct commission_bps from public.order_items")).rows).toEqual([{ commission_bps: 1500 }]);
    await q(admin, "update public.seller_accounts set commission_bps_override = 1000 where id = $1", [s.sellerId]);
    const again = (await q(user(buyer), "select * from public.create_order_from_cart()")).rows[0];
    const items = await q(admin, "select distinct commission_bps from public.order_items where order_id = $1", [again.order_id]);
    expect(items.rows).toEqual([{ commission_bps: 1000 }]);
  });

  it("refuses an empty cart and keeps payment events away from buyers", async () => {
    const buyer = await createUser("buyer@example.test");
    await expectError(user(buyer), "select * from public.create_order_from_cart()", [], /nothing to pay for/);
    await expectError(user(buyer), "select public.apply_payment_event('evt', 'checkout_session.payment.paid', '{}', false, 'cs', 'pay', 1, 0, 'gcash')", [], /permission denied/);
  });

  it("grants access, credits sellers after the hold and clears the cart on a verified payment", async () => {
    const { s, a, buyer } = await setup();
    await checkout(buyer);
    expect((await paid("evt_1", "cs_test_1", 22500)).rows[0].outcome).toBe("paid");

    expect((await q(user(buyer), "select status from public.orders")).rows[0].status).toBe("paid");
    expect((await q(user(buyer), "select source from public.entitlements")).rows).toEqual([{ source: "purchase" }, { source: "purchase" }]);
    expect((await q(user(buyer), "select * from public.cart_items")).rows).toHaveLength(0);
    const balance = await q(user(s.userId), "select balance_centavos, available_centavos from public.seller_balances");
    expect(Number(balance.rows[0].balance_centavos)).toBe(15750);
    expect(Number(balance.rows[0].available_centavos)).toBe(0);
    expect((await q(admin, "select sales_count from public.products where id = $1", [a.id])).rows[0].sales_count).toBe(1);
    const notes = await q(admin, "select user_id, type from public.notifications where type in ('order.paid', 'sale.made') order by type");
    expect(notes.rows).toEqual([{ user_id: buyer, type: "order.paid" }, { user_id: s.userId, type: "sale.made" }]);
  });

  it("ignores repeated, unknown, mismatched and other events", async () => {
    const { buyer } = await setup();
    await checkout(buyer);
    expect((await paid("evt_bad", "cs_test_1", 100)).rows[0].outcome).toBe("mismatch");
    expect((await paid("evt_live", "cs_test_1", 22500, true)).rows[0].outcome).toBe("mismatch");
    expect((await paid("evt_x", "cs_unknown", 22500)).rows[0].outcome).toBe("unknown_checkout");
    expect((await q(user(buyer), "select * from public.entitlements")).rows).toHaveLength(0);

    expect((await paid("evt_1", "cs_test_1", 22500)).rows[0].outcome).toBe("paid");
    expect((await paid("evt_1", "cs_test_1", 22500)).rows[0].outcome).toBe("duplicate");
    expect((await paid("evt_2", "cs_test_1", 22500)).rows[0].outcome).toBe("already_paid");
    const other = await q(service, "select public.apply_payment_event('evt_3', 'source.chargeable', '{}', false, null, null, null, null, null) as outcome");
    expect(other.rows[0].outcome).toBe("ignored");
    expect((await q(admin, "select count(*)::int as n from public.seller_ledger_entries")).rows[0].n).toBe(2);
  });

  it("flags a second paid order for something already owned", async () => {
    const { buyer } = await setup();
    const first = (await q(user(buyer), "select * from public.create_order_from_cart()")).rows[0];
    const second = (await q(user(buyer), "select * from public.create_order_from_cart()")).rows[0];
    for (const [o, cs] of [[first, "cs_a"], [second, "cs_b"]] as const) {
      await q(service, "insert into public.payments (order_id, provider, provider_checkout_id, amount_centavos) values ($1, 'paymongo', $2, $3)", [o.order_id, cs, o.total_centavos]);
    }
    expect((await paid("evt_a", "cs_a", 22500)).rows[0].outcome).toBe("paid");
    expect((await paid("evt_b", "cs_b", 22500)).rows[0].outcome).toBe("paid_with_duplicates");
    const flagged = await q(admin, "select count(*)::int as n from public.audit_logs where action = 'order.duplicate_purchase'");
    expect(flagged.rows[0].n).toBe(2);
  });

  it("expires only the caller's unpaid orders past the cutoff, once", async () => {
    const { buyer } = await setup();
    const stale = await checkout(buyer, "cs_stale");
    const fresh = await checkout(buyer, "cs_fresh");
    const other = await createUser("other@example.test");
    const otherOrder = await q(admin, "insert into public.orders (user_id, subtotal_centavos, total_centavos) values ($1, 5000, 5000) returning id", [other]);
    await q(admin, "update public.orders set created_at = now() - interval '26 hours' where id = any($1)", [[stale.order_id, otherOrder.rows[0].id]]);

    expect((await q(user(buyer), "select public.expire_my_stale_orders() as n")).rows[0].n).toBe(1);
    expect((await q(user(buyer), "select public.expire_my_stale_orders() as n")).rows[0].n).toBe(0);
    const orders = await q(admin, "select o.id, o.status, p.status as payment from public.orders o left join public.payments p on p.order_id = o.id");
    const byId = Object.fromEntries(orders.rows.map((r) => [r.id, [r.status, r.payment]]));
    expect(byId[stale.order_id]).toEqual(["expired", "expired"]);
    expect(byId[fresh.order_id]).toEqual(["pending_payment", "pending"]);
    expect(byId[otherOrder.rows[0].id]).toEqual(["pending_payment", null]);
    await expectError(user(buyer), "select private.expire_stale_orders(null)", [], /permission denied/);
  });

  it("never expires an order sooner than PayMongo's 24-hour checkout window", async () => {
    const { buyer } = await setup();
    const order = await checkout(buyer);
    await q(admin, "update public.platform_settings set value = '1' where key = 'orders.pending_expiry_hours'");
    await q(admin, "update public.orders set created_at = now() - interval '23 hours' where id = $1", [order.order_id]);
    expect((await q(user(buyer), "select public.expire_my_stale_orders() as n")).rows[0].n).toBe(0);
    await q(admin, "update public.orders set created_at = now() - interval '25 hours' where id = $1", [order.order_id]);
    expect((await q(user(buyer), "select public.expire_my_stale_orders() as n")).rows[0].n).toBe(1);
  });

  it("still grants access and credits the seller when PayMongo confirms after the order expired", async () => {
    const { s, buyer } = await setup();
    const order = await checkout(buyer);
    await q(admin, "update public.orders set created_at = now() - interval '30 hours' where id = $1", [order.order_id]);
    await q(user(buyer), "select public.expire_my_stale_orders()");
    expect((await q(user(buyer), "select status from public.orders")).rows[0].status).toBe("expired");

    expect((await paid("evt_late", "cs_test_1", 22500)).rows[0].outcome).toBe("paid");
    const after = await q(admin, "select o.status, o.paid_at is not null as has_paid_at, p.status as payment from public.orders o join public.payments p on p.order_id = o.id");
    expect(after.rows).toEqual([{ status: "paid", has_paid_at: true, payment: "paid" }]);
    expect((await q(user(buyer), "select source from public.entitlements")).rows).toHaveLength(2);
    const balance = await q(user(s.userId), "select balance_centavos from public.seller_balances");
    expect(Number(balance.rows[0].balance_centavos)).toBe(15750);
    const flagged = await q(admin, "select metadata->>'order_status' as was from public.audit_logs where action = 'order.paid_late'");
    expect(flagged.rows).toEqual([{ was: "expired" }]);
    // A paid order is never expired afterwards.
    expect((await q(user(buyer), "select public.expire_my_stale_orders() as n")).rows[0].n).toBe(0);
    expect((await paid("evt_late_again", "cs_test_1", 22500)).rows[0].outcome).toBe("already_paid");
  });

  it("flags a late payment for an expired order whose resources were bought again", async () => {
    const { buyer, a, b, s } = await setup();
    const first = await checkout(buyer, "cs_old");
    await q(admin, "update public.orders set created_at = now() - interval '30 hours' where id = $1", [first.order_id]);
    await q(user(buyer), "select public.expire_my_stale_orders()");
    const cart = await q(admin, "select id from public.carts where user_id = $1", [buyer]);
    await q(admin, "insert into public.cart_items (cart_id, product_id) values ($1, $2), ($1, $3) on conflict do nothing", [cart.rows[0].id, a.id, b.id]);
    await checkout(buyer, "cs_new");
    expect((await paid("evt_new", "cs_new", 22500)).rows[0].outcome).toBe("paid");
    expect((await paid("evt_old", "cs_old", 22500)).rows[0].outcome).toBe("paid_with_duplicates");
    expect((await q(admin, "select count(*)::int as n from public.audit_logs where action = 'order.duplicate_purchase'")).rows[0].n).toBe(2);
    // Both payments are recorded and credited; staff refund the duplicate.
    const ledger = await q(admin, "select count(*)::int as n from public.seller_ledger_entries where seller_account_id = $1", [s.sellerId]);
    expect(ledger.rows[0].n).toBe(4);
  });

  it("records a failed attempt without closing the order, and a retry can still pay", async () => {
    const { buyer } = await setup();
    const order = await checkout(buyer);
    await q(service, "update public.payments set provider_payment_intent_id = 'pi_1' where order_id = $1", [order.order_id]);
    const failed = (id: string, intent: string | null, reason: string | null) =>
      q(service, "select public.apply_payment_event($1, 'payment.failed', '{}'::jsonb, false, null, 'pay_f', 22500, null, 'card', $2, $3) as outcome", [id, intent, reason]);

    expect((await failed("evt_f1", "pi_1", "Your card was declined.")).rows[0].outcome).toBe("failed");
    expect((await failed("evt_f1", "pi_1", "Your card was declined.")).rows[0].outcome).toBe("duplicate");
    expect((await failed("evt_f2", "pi_unknown", null)).rows[0].outcome).toBe("unknown_payment");
    const seen = await q(user(buyer), "select o.status, p.status as payment, p.failure_reason from public.orders o join public.payments p on p.order_id = o.id");
    expect(seen.rows).toEqual([{ status: "pending_payment", payment: "failed", failure_reason: "Your card was declined." }]);
    expect((await q(user(buyer), "select * from public.entitlements")).rows).toHaveLength(0);

    expect((await paid("evt_retry", "cs_test_1", 22500)).rows[0].outcome).toBe("paid");
    const after = await q(user(buyer), "select p.status, p.failure_reason from public.payments p");
    expect(after.rows).toEqual([{ status: "paid", failure_reason: null }]);
    expect((await failed("evt_f3", "pi_1", "late failure")).rows[0].outcome).toBe("already_paid");
    expect((await q(user(buyer), "select status from public.orders")).rows[0].status).toBe("paid");
  });
});

describe("seller earnings", () => {
  it("shows each seller only their own balances, sales and release dates", async () => {
    const one = await createSeller("one@example.test", "shop-one");
    const two = await createSeller("two@example.test", "shop-two");
    const p1 = await insertProduct(admin, one.storefrontId, "one-a", { status: "published", price_centavos: 10000 });
    const p2 = await insertProduct(admin, two.storefrontId, "two-a", { status: "published", price_centavos: 20000 });
    const buyer = await createUser("buyer@example.test");
    const order = await q(admin, "insert into public.orders (user_id, subtotal_centavos, total_centavos, status) values ($1, 30000, 30000, 'paid') returning id", [buyer]);
    const item = async (productId: string, sellerId: string, price: number, fee: number) =>
      (await q(admin,
        "insert into public.order_items (order_id, product_id, seller_account_id, title_snapshot, license_type_snapshot, unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos) values ($1, $2, $3, 't', 'single_teacher', $4, 3000, $5, $6) returning id",
        [order.rows[0].id, productId, sellerId, price, fee, price - fee])).rows[0].id;
    const i1 = await item(p1.id, one.sellerId, 10000, 3000);
    const i2 = await item(p2.id, two.sellerId, 20000, 6000);
    // Seller one: an older sale already released, and a new one still on hold.
    const old = await insertProduct(admin, one.storefrontId, "one-b", { status: "published", price_centavos: 5000 });
    const i3 = await item(old.id, one.sellerId, 5000, 1500);
    await q(admin, "insert into public.seller_ledger_entries (seller_account_id, entry_type, amount_centavos, order_item_id, available_at) values ($1, 'sale', 7000, $2, now() + interval '7 days'), ($1, 'sale', 3500, $3, now() - interval '1 day'), ($4, 'sale', 14000, $5, now() + interval '7 days')",
      [one.sellerId, i1, i3, two.sellerId, i2]);

    const balances = await q(user(one.userId), "select seller_account_id, balance_centavos::int, available_centavos::int, lifetime_earnings_centavos::int from public.seller_balances");
    expect(balances.rows).toEqual([{ seller_account_id: one.sellerId, balance_centavos: 10500, available_centavos: 3500, lifetime_earnings_centavos: 10500 }]);
    const releases = await q(user(one.userId), "select seller_account_id, amount_centavos::int, sales from public.seller_upcoming_releases");
    expect(releases.rows).toEqual([{ seller_account_id: one.sellerId, amount_centavos: 7000, sales: 1 }]);
    const sales = await q(user(one.userId), "select l.amount_centavos, i.unit_price_centavos, i.platform_fee_centavos from public.seller_ledger_entries l join public.order_items i on i.id = l.order_item_id order by l.amount_centavos");
    expect(sales.rows).toEqual([
      { amount_centavos: 3500, unit_price_centavos: 5000, platform_fee_centavos: 1500 },
      { amount_centavos: 7000, unit_price_centavos: 10000, platform_fee_centavos: 3000 },
    ]);

    const twoSees = await q(user(two.userId), "select seller_account_id from public.seller_upcoming_releases union all select seller_account_id from public.seller_balances union all select seller_account_id from public.seller_ledger_entries");
    expect(new Set(twoSees.rows.map((r) => r.seller_account_id))).toEqual(new Set([two.sellerId]));
    for (const sql of ["select * from public.seller_upcoming_releases", "select * from public.seller_balances", "select * from public.seller_ledger_entries"]) {
      expect((await q(user(buyer), sql)).rows).toHaveLength(0);
    }
    await expectError(anon, "select * from public.seller_upcoming_releases", [], /permission denied/);
  });
});
