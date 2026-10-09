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
  const methods = (env.PAYMONGO_PAYMENT_METHODS?.trim() || "gcash,paymaya,card")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return { secretKey, webhookSecret, apiBase, methods };
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
