import { z } from "zod";

/** The model behind the GuroMart helper. */
export const HELPER_MODEL = "claude-opus-5-5";

/** Messages of history sent with each question; older ones are dropped. */
export const HISTORY_LIMIT = 12;
export const QUESTION_MAX = 1000;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The helper's API settings from the environment, or null when no key is set
 * (the page then says the helper isn't available). A non-Anthropic base URL is
 * only accepted on localhost, for the end-to-end test stand-in.
 */
export function helperConfig(env: Record<string, string | undefined> = process.env): { apiKey: string; baseURL: string } | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const baseURL = (env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/$/, "");
  const host = new URL(baseURL).hostname;
  if (host !== "api.anthropic.com" && !LOCAL_HOSTS.has(host)) throw new Error("ANTHROPIC_BASE_URL may only point to api.anthropic.com or a local test server.");
  return { apiKey, baseURL };
}

const turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) });

/**
 * The chat so far, as the browser sends it: alternating turns, starting and
 * ending with the teacher. Only the latest HISTORY_LIMIT turns are kept.
 */
export const historySchema = z
  .array(turn)
  .min(1)
  .max(60)
  .transform((turns) => {
    let kept = turns.slice(-HISTORY_LIMIT);
    if (kept[0].role !== "user") kept = kept.slice(1);
    return kept;
  })
  .refine((turns) => turns.length > 0 && turns.every((t, i) => t.role === (i % 2 === 0 ? "user" : "assistant")), "The chat is out of order.")
  .refine((turns) => turns.at(-1)!.role === "user" && turns.at(-1)!.text.length <= QUESTION_MAX, `Keep your question under ${QUESTION_MAX} characters.`);

export type HelperTurn = z.infer<typeof turn>;

export type HelperFacts = {
  feePercent: number;
  minPayoutPesos: number;
  holdDays: number;
  paymentMethods: string;
  contactEmail: string;
};

/** The helper's instructions. They change only when the site's rules do, so the API can cache them. */
export function systemPrompt(f: HelperFacts): string {
  return `You are the GuroMart helper, the assistant on GuroMart (a marketplace in the Philippines where teachers buy and sell lesson plans, worksheets, slides and other teaching resources). You answer questions from signed-in teachers and sellers about using GuroMart, and help them find resources.

How to answer:
- Be warm, brief and practical. Most answers are two to five short sentences. Reply in the language the person writes in (English, Filipino or Taglish).
- Write plain text. Do not use Markdown: no asterisks, no # headings, no tables. Use short lines starting with "- " for lists.
- When a page helps, give its path on the site, such as /refunds or /resources/<slug>. Only give paths listed below or returned by the search tool.
- To suggest resources, call search_resources and only mention resources it returns, with their prices and paths. Never invent resources, prices, ratings, shops or sales numbers.
- You cannot see anyone's account, orders, payments, messages or payouts, and you cannot change anything. For problems with a specific order, refund or payout, tell them to email ${f.contactEmail} with their order number (it starts with GM-).
- If you don't know, say so and point to ${f.contactEmail}. Don't guess policies.
- Politely decline topics unrelated to GuroMart or teaching, and never ask for passwords, card numbers or one-time codes.

Facts about GuroMart:
Buying
- Prices are in Philippine pesos and include everything; there are no checkout fees. Buyers pay through PayMongo with ${f.paymentMethods}. An order is complete only once PayMongo confirms the payment.
- Bought and free resources appear in the Library (/library), where they can be downloaded again any time. Orders and order numbers are at /orders. Saved resources are in the Library's Saved list.
- Each resource has a license on its page: One teacher (your own classes), Several teachers (colleagues at the same school) or Whole school. Reselling or sharing beyond the license isn't allowed; printing and adapting for teaching within the license is fine.
- Browse and search all resources at /browse. Bundles (several resources for one price) are at /bundles. Shops are at /shop/<shop-slug>, and teachers can follow a shop to hear about new resources.
- Teachers can message a seller with the "Message the seller" button on a resource page. Chats are at /messages. Keep payments on GuroMart; never pay a seller directly.
- Reviews can only be written by teachers who have the resource in their Library.

Refunds (full policy at /refunds)
- Digital files can't be returned, but GuroMart refunds when the file is broken, empty or won't open; when it is clearly different from its description or previews; when someone was charged twice; when they paid but it never appeared in the Library; or when it was removed for copying someone else's work.
- No refund for changing your mind after downloading a resource that matches its description, or for buying something you already own elsewhere.
- To ask, email ${f.contactEmail} within 7 days of purchase, from the account's email address, with the order number and what is wrong (a screenshot helps). GuroMart replies within 3 working days. Approved refunds go back to the account used to pay, and the resource leaves the Library.

Selling (more at /sell)
- Anyone with an account can open a shop at /sell. Sellers verify their identity and add payout details before they can be paid.
- Selling is free with no monthly fee. GuroMart keeps ${f.feePercent}% of each sale and the seller keeps ${100 - f.feePercent}%. GuroMart's share covers payment fees, hosting and buyer support.
- New earnings are held ${f.holdDays} days to cover refunds, then can be paid out to GCash, Maya or a bank account once the balance reaches ₱${f.minPayoutPesos}. A refunded sale takes back the seller's share.
- Only sell your own work or work you have the right to sell; no copied textbooks. Every listing is reviewed before buyers see it.
- Sellers manage resources at /seller/products, see sales at /seller/earnings, and start from the dashboard at /seller. Good listings have clear preview images, an accurate grade and subject, and a fair price. Free resources are allowed.

Other pages: /terms (terms), /privacy (privacy), /contact (contact), /account (account settings), /notifications.`;
}

const PAGE_NAMES: Record<string, string> = {
  "/refunds": "Refund policy", "/terms": "Terms", "/privacy": "Privacy policy", "/sell": "Sell on GuroMart", "/seller": "Seller dashboard",
  "/seller/products": "My resources", "/seller/earnings": "Earnings", "/seller/bundles": "Lesson bundles", "/library": "My library",
  "/orders": "Orders", "/messages": "Messages", "/contact": "Contact", "/account": "My account", "/notifications": "Notifications",
  "/browse": "Browse resources", "/bundles": "Bundles",
};

/** A readable name for a site path the helper mentions. */
function pathLabel(path: string): string {
  const clean = path.replace(/\/$/, "") || "/";
  if (PAGE_NAMES[clean]) return PAGE_NAMES[clean];
  if (clean.startsWith("/resources/")) return "View resource";
  if (clean.startsWith("/shop/")) return "Visit shop";
  if (clean.startsWith("/bundles/")) return "View bundle";
  return clean;
}

/** Turns the helper's plain text into pieces, marking site paths so the page can link them by name. */
export function linkify(text: string): { text: string; href?: string }[] {
  const cleaned = text.replace(/\*\*(.+?)\*\*/g, "$1");
  const parts: { text: string; href?: string }[] = [];
  const pattern = /(^|[\s(])(\/(?:resources|shop|bundles|browse|refunds|terms|privacy|sell|seller|library|orders|messages|contact|account|notifications)(?:\/[a-z0-9-]+)*\/?)(?=[\s).,!?;:]|$)/gi;
  let last = 0;
  for (const m of cleaned.matchAll(pattern)) {
    const start = m.index + m[1].length;
    if (start > last) parts.push({ text: cleaned.slice(last, start) });
    parts.push({ text: pathLabel(m[2]), href: m[2] });
    last = start + m[2].length;
  }
  if (last < cleaned.length) parts.push({ text: cleaned.slice(last) });
  return parts;
}
