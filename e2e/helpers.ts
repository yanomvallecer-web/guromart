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
  for (let attempt = 0; attempt < 30; attempt++) {
    const body = await latestMessage(email);
    const code = body?.replace(/=\r?\n/g, "").match(/enter the code:?\s*(?:<[^>]+>\s*)*(\d{6,8})/i)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

async function latestMessage(email: string): Promise<string | null> {
  if (process.env.E2E_MAILPIT_URL) {
    const base = process.env.E2E_MAILPIT_URL;
    const list = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json());
    const id = list.messages?.[0]?.ID;
    if (!id) return null;
    const msg = await fetch(`${base}/api/v1/message/${id}`).then((r) => r.json());
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
  await expect(page.getByText(`We sent a sign-in code to ${email}`)).toBeVisible();
  await page.getByLabel("Code from your email").fill(await latestCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
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
