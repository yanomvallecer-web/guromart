import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { type Page, expect } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
// Legacy JWT keys go in Authorization too; new sb_secret_ keys only in apikey.
const authHeaders = (): Record<string, string> =>
  SECRET.split(".").length === 3 ? { apikey: SECRET, Authorization: `Bearer ${SECRET}` } : { apikey: SECRET };

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/**
 * Reads the latest sign-in code sent to an address. Works with the Mailpit
 * inbox that `supabase start` runs (E2E_MAILPIT_URL) or a directory of .eml
 * files from a dev SMTP sink (E2E_MAIL_DIR).
 */
export async function latestCode(email: string): Promise<string> {
  let last: string | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    last = await latestMessage(email);
    const code = last?.replace(/=\r?\n/g, "").match(/(?:enter the code|your code):?\s*(?:<[^>]+>\s*)*(\d{6,8})/i)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code arrived for ${email}. Last inbox result: ${last?.slice(0, 500) ?? lastInboxNote}`);
}

let lastInboxNote = "nothing";

type MailpitSummary = { ID: string; To?: { Address: string }[] };

async function latestMessage(email: string): Promise<string | null> {
  if (process.env.E2E_MAILPIT_URL) {
    const base = process.env.E2E_MAILPIT_URL.replace(/\/$/, "");
    // Newest first. Filter ourselves instead of relying on Mailpit's search syntax.
    const res = await fetch(`${base}/api/v1/messages?limit=100`);
    const raw = await res.text();
    let list: { messages?: MailpitSummary[] };
    try {
      list = JSON.parse(raw);
    } catch {
      lastInboxNote = `HTTP ${res.status}: ${raw.slice(0, 200)}`;
      return null;
    }
    const match = list.messages?.find((m) => m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
    if (!match) {
      lastInboxNote = `${list.messages?.length ?? 0} messages, none to ${email}`;
      return null;
    }
    const msg = await fetch(`${base}/api/v1/message/${match.ID}`).then((r) => r.json());
    return `${msg.Text ?? ""}\n${msg.HTML ?? ""}`;
  }
  const dir = process.env.E2E_MAIL_DIR;
  if (!dir) throw new Error("Set E2E_MAILPIT_URL or E2E_MAIL_DIR so tests can read sign-in codes.");
  const files = (await readdir(dir)).filter((f) => f.includes(email)).sort();
  return files.length ? readFile(path.join(dir, files[files.length - 1]), "utf8") : null;
}

export async function signIn(page: Page, email: string, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  // The phone's code autofill puts the whole code in the first box; the form then submits itself.
  await page.getByRole("textbox", { name: "Digit 1 of 6" }).fill(await latestCode(email));
  await page.waitForURL((url) => url.pathname === next);
}

/** Service-role REST call for test setup only (granting admin, approving listings). */
export async function serviceRest(pathAndQuery: string, init: RequestInit = {}) {
  if (!SECRET) throw new Error("SUPABASE_SECRET_KEY is required for e2e setup.");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

export async function userIdFor(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: authHeaders(),
  });
  const body = await res.json();
  const user = body.users?.find((u: { email: string }) => u.email === email);
  if (!user) throw new Error(`No auth user for ${email}`);
  return user.id;
}

/** Names of the objects stored under a folder of a bucket, read with the service key. */
export async function storedObjects(bucket: string, prefix: string): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  if (!res.ok) throw new Error(`list ${bucket}/${prefix} failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { name: string }[]).map((o) => o.name);
}

const TEST_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export async function upload(bucket: string, objectPath: string, body: Buffer, contentType: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${objectPath} failed: ${res.status} ${await res.text()}`);
}

/**
 * Creates a seller with one live listing directly through the service APIs,
 * for tests about buying rather than listing. The seller can sign in with
 * the returned email. The file and preview are real
 * objects in storage and the listing goes live through the database publish check.
 */
export async function createLiveListing(title: string, priceCentavos: number, previewCount = 1) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const sellerEmail = `listed-${stamp}@example.test`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email: sellerEmail, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create seller user failed: ${res.status} ${await res.text()}`);
  const userId = ((await res.json()) as { id: string }).id;
  const [account] = await serviceRest("seller_accounts", { method: "POST", body: JSON.stringify({ user_id: userId, seller_type: "teacher", status: "active" }) });
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: userId, role: "seller" }) });
  const [store] = await serviceRest("storefronts", {
    method: "POST",
    body: JSON.stringify({ seller_account_id: account.id, slug: `buy-${stamp}`, name: "Buying Test Shop", is_published: true }),
  });
  const [category] = await serviceRest("product_categories?code=eq.worksheet&select=id");
  const slug = `buy-test-${stamp}`;
  const [product] = await serviceRest("products", {
    method: "POST",
    body: JSON.stringify({
      storefront_id: store.id, slug, title, category_id: category.id, price_centavos: priceCentavos,
      copyright_declared_at: new Date().toISOString(), status: "draft",
    }),
  });
  const filePath = `${account.id}/${product.id}/${stamp}.pdf`;
  const previewPath = `${account.id}/${product.id}/${stamp}.png`;
  await upload("product-files", filePath, TEST_PDF, "application/pdf");
  await upload("product-previews", previewPath, TEST_PNG, "image/png");
  const [file] = await serviceRest("product_files", {
    method: "POST",
    body: JSON.stringify({
      product_id: product.id, storage_path: filePath, original_filename: "worksheet.pdf",
      mime_type: "application/pdf", file_format: "pdf", size_bytes: TEST_PDF.length, scan_status: "clean",
    }),
  });
  await serviceRest("product_previews", { method: "POST", body: JSON.stringify({ product_id: product.id, storage_path: previewPath, sort_order: 0 }) });
  for (let i = 1; i < previewCount; i++) {
    const extraPath = `${account.id}/${product.id}/${stamp}-${i}.png`;
    await upload("product-previews", extraPath, TEST_PNG, "image/png");
    await serviceRest("product_previews", { method: "POST", body: JSON.stringify({ product_id: product.id, storage_path: extraPath, sort_order: i }) });
  }
  await serviceRest(`products?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
  return { productId: product.id as string, slug, fileId: file.id as string, sellerEmail, folder: `${account.id}/${product.id}` };
}
