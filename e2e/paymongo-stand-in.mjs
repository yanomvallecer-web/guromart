// A local stand-in for PayMongo's Checkout API, for end-to-end tests only.
// It accepts checkout sessions the way api.paymongo.com does, shows a
// clearly labelled test payment page, and on "Pay" sends the app a webhook
// signed exactly like PayMongo's (HMAC-SHA256 of "<t>.<body>", header
// "Paymongo-Signature: t=..,te=..,li="). It is never used outside tests: the
// app only accepts a non-PayMongo API base on localhost.
//
//   PAYMONGO_SECRET_KEY=sk_test_e2e PAYMONGO_WEBHOOK_SECRET=whsk_test_e2e node e2e/paymongo-stand-in.mjs
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.STAND_IN_PORT ?? 4010);
const SECRET_KEY = process.env.PAYMONGO_SECRET_KEY ?? "sk_test_e2e";
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? "whsk_test_e2e";
const WEBHOOK_URL = process.env.STAND_IN_WEBHOOK_URL ?? "http://localhost:3000/api/webhooks/paymongo";
const BASE = `http://127.0.0.1:${PORT}`;

const sessions = new Map();
let lastDelivery = null;

const id = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function signature(body, secret = WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},te=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")},li=`;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString();
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function deliver(session) {
  const body = JSON.stringify({
    data: {
      id: id("evt"),
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: session.id,
          type: "checkout_session",
          attributes: {
            reference_number: session.reference_number,
            payments: [{ id: id("pay"), type: "payment", attributes: { amount: session.total, fee: Math.round(session.total * 0.025), status: "paid", source: { type: "gcash" }, livemode: false } }],
          },
        },
      },
    },
  });
  const header = signature(body);
  const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json", "Paymongo-Signature": header }, body });
  lastDelivery = { body, header, status: res.status, response: await res.text() };
  return lastDelivery;
}

createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    if (req.method === "POST" && url.pathname === "/v1/checkout_sessions") {
      if (req.headers.authorization !== `Basic ${Buffer.from(`${SECRET_KEY}:`).toString("base64")}`) {
        return send(res, 401, { errors: [{ code: "unauthorized", detail: "Invalid API key" }] });
      }
      const attrs = JSON.parse(await readBody(req)).data.attributes;
      const session = {
        id: id("cs"),
        reference_number: attrs.reference_number,
        line_items: attrs.line_items,
        total: attrs.line_items.reduce((s, l) => s + l.amount * l.quantity, 0),
        success_url: attrs.success_url,
        cancel_url: attrs.cancel_url,
      };
      sessions.set(session.id, session);
      return send(res, 200, { data: { id: session.id, type: "checkout_session", attributes: { checkout_url: `${BASE}/checkout/${session.id}`, livemode: false, status: "active", ...attrs } } });
    }
    const page = url.pathname.match(/^\/checkout\/(cs_[0-9a-f]+)(\/pay)?$/);
    const session = page && sessions.get(page[1]);
    if (page && !session) return send(res, 404, "Unknown checkout", "text/plain");
    if (page && req.method === "GET" && !page[2]) {
      const items = session.line_items.map((l) => `<li>${escape(l.name)}: ₱${(l.amount / 100).toFixed(2)}</li>`).join("");
      return send(res, 200, `<!doctype html><meta charset="utf-8"><title>PayMongo test stand-in</title>
        <h1>PayMongo test stand-in</h1><p>Order ${escape(session.reference_number)}. Not a real payment page.</p><ul>${items}</ul>
        <p>Total ₱${(session.total / 100).toFixed(2)}</p>
        <form method="post" action="/checkout/${session.id}/pay"><button>Pay (test)</button></form>
        <p><a href="${escape(session.cancel_url)}">Cancel</a></p>`, "text/html");
    }
    if (page && req.method === "POST" && page[2]) {
      await deliver(session);
      res.writeHead(303, { Location: session.success_url });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/last-delivery") return send(res, 200, lastDelivery ?? {});
    send(res, 404, "Not found", "text/plain");
  } catch (e) {
    send(res, 500, String(e), "text/plain");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`PayMongo test stand-in on ${BASE}`));
