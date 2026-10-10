import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * PayMongo Checkout Sessions and webhook verification.
 * Docs: https://docs.paymongo.com/docs/checkout-implementation and
 * https://developers.paymongo.com/docs/creating-webhook
 */

export type PaymongoConfig = { secretKey: string; webhookSecret: string; apiBase: string; methods: string[] };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Payment configuration from the server environment, or null when payments
 * are not set up. Only test keys are accepted until GuroMart is cleared to
 * take real payments. A different API base (a local stand-in for tests) is
 * only allowed on localhost.
 */
export function paymongoConfig(env: Record<string, string | undefined> = process.env): PaymongoConfig | null {
  const secretKey = env.PAYMONGO_SECRET_KEY?.trim();
  const webhookSecret = env.PAYMONGO_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) return null;
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("PAYMONGO_SECRET_KEY must be a test key (sk_test_…). Live payments are not enabled.");
  }
  const apiBase = (env.PAYMONGO_API_BASE?.trim() || "https://api.paymongo.com").replace(/\/$/, "");
  const host = new URL(apiBase).hostname;
  if (host !== "api.paymongo.com" && !LOCAL_HOSTS.has(host)) {
    throw new Error("PAYMONGO_API_BASE may only point to api.paymongo.com or a local test server.");
  }
  return { secretKey, webhookSecret, apiBase, methods: paymentMethods(env) };
}

/** For pages: whether checkout can be offered. A bad setup hides checkout and is logged instead of breaking the page. */
export function paymentsReady(env: Record<string, string | undefined> = process.env): boolean {
  try {
    return paymongoConfig(env) !== null;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * How buyers can pay, from PAYMONGO_PAYMENT_METHODS. The default is QR Ph,
 * the one method an individual (unregistered) PayMongo account can accept;
 * buyers scan it with GCash, Maya or a bank app. A registered business can
 * list more, such as "qrph,gcash,paymaya,card".
 */
export function paymentMethods(env: Record<string, string | undefined> = process.env): string[] {
  return (env.PAYMONGO_PAYMENT_METHODS?.trim() || "qrph")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** A short line naming the ways to pay, for price boxes. */
export function paymentMethodsShort(methods: string[] = paymentMethods()): string {
  const named = methods.filter((m) => m !== "qrph").map((m) => METHOD_NAME[m] ?? m);
  return methods.includes("qrph") && !named.length ? "GCash · Maya · bank apps (QR Ph)" : [...named, ...(methods.includes("qrph") ? ["QR Ph"] : [])].join(" · ");
}

/** The ways to pay in a sentence: "with …". */
export function paymentMethodsSentence(methods: string[] = paymentMethods()): string {
  const named = methods.filter((m) => m !== "qrph").map((m) => (m === "card" ? "a card" : (METHOD_NAME[m] ?? m)));
  if (methods.includes("qrph")) named.push(named.length ? "a QR Ph code from any bank app" : "a QR Ph code you scan with GCash, Maya or your bank app");
  return named.length > 1 ? `${named.slice(0, -1).join(", ")} or ${named.at(-1)}` : (named[0] ?? "");
}

export const METHOD_NAME: Record<string, string> = { qrph: "QR Ph", gcash: "GCash", paymaya: "Maya", card: "Card", grab_pay: "GrabPay" };

/**
 * Asks PayMongo which payment methods this account may use. Only the secret
 * key is needed, so staff can check before the webhook is set up. The response
 * shape isn't documented, so any list of method names found in it is returned.
 */
export async function accountPaymentMethods(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true; methods: string[]; mode: "test" | "live" } | { ok: false; error: string }> {
  const secretKey = env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) return { ok: false, error: "PAYMONGO_SECRET_KEY isn't set yet." };
  if (!/^sk_(test|live)_/.test(secretKey)) return { ok: false, error: "PAYMONGO_SECRET_KEY doesn't look like a PayMongo secret key (sk_test_… or sk_live_…)." };
  const apiBase = (env.PAYMONGO_API_BASE?.trim() || "https://api.paymongo.com").replace(/\/$/, "");
  const host = new URL(apiBase).hostname;
  if (host !== "api.paymongo.com" && !LOCAL_HOSTS.has(host)) return { ok: false, error: "PAYMONGO_API_BASE points somewhere unexpected." };
  try {
    const res = await fetch(`${apiBase}/v1/merchants/capabilities/payment_methods`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (body as { errors?: { detail?: string }[] } | null)?.errors?.[0]?.detail;
      return { ok: false, error: `PayMongo answered ${res.status}${detail ? `: ${detail.replace(/\.$/, "")}` : ""}.` };
    }
    return { ok: true, methods: methodNames(body), mode: secretKey.startsWith("sk_live_") ? "live" : "test" };
  } catch {
    return { ok: false, error: "Couldn't reach PayMongo." };
  }
}

export const WEBHOOK_EVENTS = ["checkout_session.payment.paid", "payment.failed"];

/**
 * Creates (or finds) the PayMongo webhook that tells GuroMart about payments,
 * and returns its signing secret for PAYMONGO_WEBHOOK_SECRET. Docs:
 * https://developers.paymongo.com/docs/creating-webhook
 */
export async function setUpWebhook(
  url: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true; secret: string; existed: boolean } | { ok: false; error: string }> {
  const secretKey = env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey?.startsWith("sk_test_")) return { ok: false, error: "Add the PayMongo test secret key (sk_test_…) to Vercel first." };
  const apiBase = (env.PAYMONGO_API_BASE?.trim() || "https://api.paymongo.com").replace(/\/$/, "");
  if (!["api.paymongo.com", ...LOCAL_HOSTS].includes(new URL(apiBase).hostname)) return { ok: false, error: "PAYMONGO_API_BASE points somewhere unexpected." };
  const headers = { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" };
  const hook = z.object({ id: z.string(), attributes: z.object({ url: z.string(), secret_key: z.string().nullish(), events: z.array(z.string()).default([]) }) });
  const fail = (res: Response, body: unknown) => {
    const detail = (body as { errors?: { detail?: string }[] } | null)?.errors?.[0]?.detail;
    return { ok: false as const, error: `PayMongo answered ${res.status}${detail ? `: ${detail.replace(/\.$/, "")}` : ""}.` };
  };
  try {
    const listRes = await fetch(`${apiBase}/v1/webhooks`, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const listBody: unknown = await listRes.json().catch(() => null);
    if (!listRes.ok) return fail(listRes, listBody);
    const existing = z.object({ data: z.array(hook) }).safeParse(listBody);
    const same = existing.success ? existing.data.data.find((h) => h.attributes.url === url) : undefined;
    if (same) {
      if (!WEBHOOK_EVENTS.every((e) => same.attributes.events.includes(e))) {
        return { ok: false, error: "A webhook for this address exists but misses some events. Delete it in PayMongo, then try again." };
      }
      return same.attributes.secret_key ? { ok: true, secret: same.attributes.secret_key, existed: true } : { ok: false, error: "A webhook for this address already exists, but PayMongo didn't return its secret." };
    }
    const res = await fetch(`${apiBase}/v1/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: { attributes: { url, events: WEBHOOK_EVENTS } } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: unknown = await res.json().catch(() => null);
    const created = z.object({ data: hook }).safeParse(body);
    if (!res.ok || !created.success || !created.data.data.attributes.secret_key) return fail(res, body);
    return { ok: true, secret: created.data.data.attributes.secret_key, existed: false };
  } catch {
    return { ok: false, error: "Couldn't reach PayMongo." };
  }
}

/** Method names from an undocumented response: a list of strings, or objects with a type/name, at any depth. */
export function methodNames(body: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") found.add(item);
        else if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const name = [o.type, o.name, o.payment_method_type, o.id].find((x) => typeof x === "string");
          if (typeof name === "string") found.add(name);
          walk(o.attributes, depth + 1);
        }
      }
    } else if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  walk(body, 0);
  return [...found];
}

export type CheckoutLine = { name: string; amountCentavos: number };

export async function createCheckoutSession(
  config: PaymongoConfig,
  input: { orderNumber: string; lines: CheckoutLine[]; successUrl: string; cancelUrl: string; email?: string | null },
): Promise<{ id: string; checkoutUrl: string; livemode: boolean; paymentIntentId: string | null }> {
  const res = await fetch(`${config.apiBase}/v1/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: input.lines.map((l) => ({ name: l.name.slice(0, 255), amount: l.amountCentavos, currency: "PHP", quantity: 1 })),
          payment_method_types: config.methods,
          reference_number: input.orderNumber,
          description: `GuroMart order ${input.orderNumber}`,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          send_email_receipt: true,
          show_line_items: true,
          show_description: true,
          ...(input.email ? { billing: { email: input.email } } : {}),
          metadata: { order_number: input.orderNumber },
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  const parsed = z
    .object({
      data: z.object({
        id: z.string().startsWith("cs_"),
        attributes: z.object({
          checkout_url: z.url(),
          livemode: z.boolean().default(false),
          payment_intent: z.object({ id: z.string().min(1) }).nullish(),
        }),
      }),
    })
    .safeParse(body);
  if (!res.ok || !parsed.success) {
    const detail = (body as { errors?: { detail?: string }[] } | null)?.errors?.[0]?.detail;
    throw new Error(`PayMongo did not open a checkout (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  const { attributes } = parsed.data.data;
  return {
    id: parsed.data.data.id,
    checkoutUrl: attributes.checkout_url,
    livemode: attributes.livemode,
    paymentIntentId: attributes.payment_intent?.id ?? null,
  };
}

/**
 * Checks a Paymongo-Signature header ("t=<unix>,te=<hex>,li=<hex>") against
 * the raw request body: HMAC-SHA256 of "<t>.<body>" with the webhook secret,
 * compared with te in test mode and li in live mode.
 */
export function verifyWebhookSignature(header: string | null, rawBody: string, secret: string): { ok: true; livemode: boolean } | { ok: false } {
  if (!header) return { ok: false };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  if (!parts.t || !/^\d+$/.test(parts.t)) return { ok: false };
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest();
  const matches = (sig: string | undefined) => {
    if (!sig || !/^[0-9a-f]+$/i.test(sig)) return false;
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  if (matches(parts.te)) return { ok: true, livemode: false };
  if (matches(parts.li)) return { ok: true, livemode: true };
  return { ok: false };
}

export type WebhookEvent = {
  eventId: string;
  type: string;
  livemode: boolean;
  checkoutId: string | null;
  paymentId: string | null;
  amountCentavos: number | null;
  feeCentavos: number | null;
  method: string | null;
  /** payment.failed only: the payment intent behind the checkout session, and PayMongo's reason. */
  paymentIntentId: string | null;
  failureMessage: string | null;
};

const eventSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({
      type: z.string().min(1),
      livemode: z.boolean().default(false),
      data: z.unknown(),
    }),
  }),
});

const paidSessionSchema = z.object({
  id: z.string().startsWith("cs_"),
  attributes: z.object({
    payments: z
      .array(
        z.object({
          id: z.string(),
          attributes: z.object({
            amount: z.number().int(),
            fee: z.number().int().nullish(),
            status: z.string(),
            source: z.object({ type: z.string() }).nullish(),
            payment_method_used: z.string().nullish(),
          }),
        }),
      )
      .min(1),
  }),
});

// A failed attempt (e.g. a declined card or a cancelled e-wallet approval).
// The buyer can still pay on the same checkout page afterwards.
const failedPaymentSchema = z.object({
  id: z.string(),
  attributes: z.object({
    amount: z.number().int().nullish(),
    payment_intent_id: z.string().min(1),
    failed_message: z.string().nullish(),
    failed_code: z.string().nullish(),
    source: z.object({ type: z.string() }).nullish(),
  }),
});

/** Reads the fields GuroMart needs from a webhook body. Returns null for malformed events. */
export function parseWebhookEvent(rawBody: string): WebhookEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const event = eventSchema.safeParse(json);
  if (!event.success) return null;
  const { id, attributes } = event.data.data;
  const base: WebhookEvent = {
    eventId: id,
    type: attributes.type,
    livemode: attributes.livemode,
    checkoutId: null,
    paymentId: null,
    amountCentavos: null,
    feeCentavos: null,
    method: null,
    paymentIntentId: null,
    failureMessage: null,
  };
  if (attributes.type === "payment.failed") {
    // Not every failed payment belongs to a GuroMart checkout; unmatched ones are recorded and ignored.
    const payment = failedPaymentSchema.safeParse(attributes.data);
    if (!payment.success) return base;
    const a = payment.data.attributes;
    return {
      ...base,
      paymentId: payment.data.id,
      amountCentavos: a.amount ?? null,
      method: a.source?.type ?? null,
      paymentIntentId: a.payment_intent_id,
      failureMessage: a.failed_message?.trim().slice(0, 500) || a.failed_code || null,
    };
  }
  if (attributes.type !== "checkout_session.payment.paid") return base;

  const session = paidSessionSchema.safeParse(attributes.data);
  if (!session.success) return null;
  const payment = session.data.attributes.payments.find((p) => p.attributes.status === "paid");
  if (!payment) return null;
  return {
    ...base,
    checkoutId: session.data.id,
    paymentId: payment.id,
    amountCentavos: payment.attributes.amount,
    feeCentavos: payment.attributes.fee ?? null,
    method: payment.attributes.source?.type ?? payment.attributes.payment_method_used ?? null,
  };
}
