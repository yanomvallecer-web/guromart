import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymongoConfig, parseWebhookEvent, verifyWebhookSignature } from "./paymongo";

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
    });
  });

  it("passes other event types through without payment details", () => {
    const body = JSON.stringify({ data: { id: "evt_9", attributes: { type: "payment.failed", livemode: false, data: {} } } });
    expect(parseWebhookEvent(body)).toMatchObject({ eventId: "evt_9", type: "payment.failed", checkoutId: null });
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

  it("defaults to the PayMongo API with GCash, Maya and cards", () => {
    expect(paymongoConfig(base)).toEqual({ ...{ secretKey: "sk_test_abc", webhookSecret: "whsk_abc" }, apiBase: "https://api.paymongo.com", methods: ["gcash", "paymaya", "card"] });
  });

  it("refuses live keys and unknown API hosts", () => {
    expect(() => paymongoConfig({ ...base, PAYMONGO_SECRET_KEY: "sk_live_abc" })).toThrow(/test key/);
    expect(() => paymongoConfig({ ...base, PAYMONGO_API_BASE: "https://evil.example.com" })).toThrow(/API_BASE/);
    expect(paymongoConfig({ ...base, PAYMONGO_API_BASE: "http://127.0.0.1:4010/" })?.apiBase).toBe("http://127.0.0.1:4010");
  });
});
