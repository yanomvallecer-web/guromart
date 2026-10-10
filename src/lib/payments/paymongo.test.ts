import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { methodNames, setUpWebhook, WEBHOOK_EVENTS, parseWebhookEvent, paymentMethodsSentence, paymentMethodsShort, paymongoConfig, verifyWebhookSignature } from "./paymongo";

const secret = "whsk_test_secret";
const sign = (body: string, t = "1791580000", key = secret) => createHmac("sha256", key).update(`${t}.${body}`).digest("hex");

const paidEvent = JSON.stringify({
  data: {
    id: "evt_123",
    type: "event",
    attributes: {
      type: "checkout_session.payment.paid",
      livemode: false,
      data: {
        id: "cs_abc",
        type: "checkout_session",
        attributes: {
          reference_number: "GM-100001",
          payments: [{ id: "pay_xyz", type: "payment", attributes: { amount: 22500, fee: 563, status: "paid", source: { type: "gcash" } } }],
        },
      },
    },
  },
});

describe("verifyWebhookSignature", () => {
  it("accepts a valid test-mode signature over the raw body", () => {
    const header = `t=1791580000,te=${sign(paidEvent)},li=`;
    expect(verifyWebhookSignature(header, paidEvent, secret)).toEqual({ ok: true, livemode: false });
  });

  it("recognises live-mode signatures", () => {
    const header = `t=1791580000,te=,li=${sign(paidEvent)}`;
    expect(verifyWebhookSignature(header, paidEvent, secret)).toEqual({ ok: true, livemode: true });
  });

  it("rejects a changed body, wrong secret, wrong timestamp or missing header", () => {
    const header = `t=1791580000,te=${sign(paidEvent)},li=`;
    expect(verifyWebhookSignature(header, paidEvent.replace("22500", "100"), secret).ok).toBe(false);
    expect(verifyWebhookSignature(`t=1791580000,te=${sign(paidEvent, "1791580000", "other")},li=`, paidEvent, secret).ok).toBe(false);
    expect(verifyWebhookSignature(header.replace("t=1791580000", "t=1791580001"), paidEvent, secret).ok).toBe(false);
    expect(verifyWebhookSignature(null, paidEvent, secret).ok).toBe(false);
    expect(verifyWebhookSignature("te=zz", paidEvent, secret).ok).toBe(false);
  });
});

describe("parseWebhookEvent", () => {
  it("reads the checkout, payment, amount, fee and method of a paid checkout", () => {
    expect(parseWebhookEvent(paidEvent)).toEqual({
      eventId: "evt_123",
      type: "checkout_session.payment.paid",
      livemode: false,
      checkoutId: "cs_abc",
      paymentId: "pay_xyz",
      amountCentavos: 22500,
      feeCentavos: 563,
      method: "gcash",
      paymentIntentId: null,
      failureMessage: null,
    });
  });

  it("reads the payment intent and reason of a failed attempt", () => {
    const body = JSON.stringify({
      data: {
        id: "evt_f",
        attributes: {
          type: "payment.failed",
          livemode: false,
          data: { id: "pay_f", type: "payment", attributes: { amount: 22500, status: "failed", payment_intent_id: "pi_1", failed_code: "card_declined", failed_message: "Your card was declined.", source: { type: "card" } } },
        },
      },
    });
    expect(parseWebhookEvent(body)).toEqual({
      eventId: "evt_f",
      type: "payment.failed",
      livemode: false,
      checkoutId: null,
      paymentId: "pay_f",
      amountCentavos: 22500,
      feeCentavos: null,
      method: "card",
      paymentIntentId: "pi_1",
      failureMessage: "Your card was declined.",
    });
    const codeOnly = body.replace(',"failed_message":"Your card was declined."', "");
    expect(parseWebhookEvent(codeOnly)?.failureMessage).toBe("card_declined");
  });

  it("passes other event types, and failed payments it can't match, through without payment details", () => {
    const failed = JSON.stringify({ data: { id: "evt_9", attributes: { type: "payment.failed", livemode: false, data: {} } } });
    expect(parseWebhookEvent(failed)).toMatchObject({ eventId: "evt_9", type: "payment.failed", checkoutId: null, paymentIntentId: null });
    const other = JSON.stringify({ data: { id: "evt_8", attributes: { type: "source.chargeable", livemode: false, data: {} } } });
    expect(parseWebhookEvent(other)).toMatchObject({ eventId: "evt_8", type: "source.chargeable", checkoutId: null });
  });

  it("rejects malformed bodies and paid events without a paid payment", () => {
    expect(parseWebhookEvent("not json")).toBeNull();
    expect(parseWebhookEvent(JSON.stringify({ data: {} }))).toBeNull();
    expect(parseWebhookEvent(paidEvent.replace('"status":"paid"', '"status":"failed"'))).toBeNull();
  });
});

describe("paymongoConfig", () => {
  const base = { PAYMONGO_SECRET_KEY: "sk_test_abc", PAYMONGO_WEBHOOK_SECRET: "whsk_abc" };

  it("is off until both keys are set", () => {
    expect(paymongoConfig({})).toBeNull();
    expect(paymongoConfig({ PAYMONGO_SECRET_KEY: "sk_test_abc" })).toBeNull();
  });

  it("defaults to the PayMongo API with QR Ph, which individual accounts can accept", () => {
    expect(paymongoConfig(base)).toEqual({ ...{ secretKey: "sk_test_abc", webhookSecret: "whsk_abc" }, apiBase: "https://api.paymongo.com", methods: ["qrph"] });
    expect(paymongoConfig({ ...base, PAYMONGO_PAYMENT_METHODS: "qrph, gcash,paymaya,card" })?.methods).toEqual(["qrph", "gcash", "paymaya", "card"]);
  });

  it("names the ways to pay for buyers", () => {
    expect(paymentMethodsShort(["qrph"])).toBe("GCash · Maya · bank apps (QR Ph)");
    expect(paymentMethodsShort(["gcash", "paymaya", "card"])).toBe("GCash · Maya · Card");
    expect(paymentMethodsShort(["qrph", "gcash", "card"])).toBe("GCash · Card · QR Ph");
    expect(paymentMethodsSentence(["qrph"])).toBe("a QR Ph code you scan with GCash, Maya or your bank app");
    expect(paymentMethodsSentence(["gcash", "paymaya", "card"])).toBe("GCash, Maya or a card");
    expect(paymentMethodsSentence(["gcash", "card", "qrph"])).toBe("GCash, a card or a QR Ph code from any bank app");
  });

  it("refuses live keys and unknown API hosts", () => {
    expect(() => paymongoConfig({ ...base, PAYMONGO_SECRET_KEY: "sk_live_abc" })).toThrow(/test key/);
    expect(() => paymongoConfig({ ...base, PAYMONGO_API_BASE: "https://evil.example.com" })).toThrow(/API_BASE/);
    expect(paymongoConfig({ ...base, PAYMONGO_API_BASE: "http://127.0.0.1:4010/" })?.apiBase).toBe("http://127.0.0.1:4010");
  });
});

describe("methodNames", () => {
  it("finds method names in the shapes PayMongo might return", () => {
    expect(methodNames(["qrph", "card"])).toEqual(["qrph", "card"]);
    expect(methodNames({ data: ["qrph"] })).toEqual(["qrph"]);
    expect(methodNames({ data: [{ type: "gcash" }, { attributes: { payment_methods: ["paymaya"] } }] })).toEqual(["gcash", "paymaya"]);
    expect(methodNames(null)).toEqual([]);
  });
});

describe("setUpWebhook", () => {
  const env = { PAYMONGO_SECRET_KEY: "sk_test_abc" };
  const url = "https://guromart.vercel.app/api/webhooks/paymongo";
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  afterEach(() => vi.unstubAllGlobals());

  it("refuses without a test key", async () => {
    expect(await setUpWebhook(url, {})).toMatchObject({ ok: false });
    expect(await setUpWebhook(url, { PAYMONGO_SECRET_KEY: "sk_live_x" })).toMatchObject({ ok: false });
  });

  it("creates the webhook with both events and returns its secret", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: [] }))
      .mockResolvedValueOnce(json(200, { data: { id: "hook_1", attributes: { url, secret_key: "whsk_new", events: WEBHOOK_EVENTS } } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await setUpWebhook(url, env)).toEqual({ ok: true, secret: "whsk_new", existed: false });
    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ data: { attributes: { url, events: WEBHOOK_EVENTS } } });
  });

  it("reuses an existing webhook for the same address", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, { data: [{ id: "hook_1", attributes: { url, secret_key: "whsk_old", events: WEBHOOK_EVENTS } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await setUpWebhook(url, env)).toEqual({ ok: true, secret: "whsk_old", existed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports PayMongo's error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(401, { errors: [{ detail: "API key is invalid." }] })));
    expect(await setUpWebhook(url, env)).toEqual({ ok: false, error: "PayMongo answered 401: API key is invalid." });
  });
});
