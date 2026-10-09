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
    await expectError(user(buyer), "insert into public.cart_items (cart_id, product_id) values ($1, $2)", [cartId, draft.id], /row-level security/);
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
