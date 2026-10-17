// A local stand-in for the Anthropic Messages API, for end-to-end tests only.
// It answers the GuroMart helper with scripted replies so the chat, the
// resource-search tool and the daily limit can be tested without a real key
// or real model calls. The app only accepts a non-Anthropic API base on
// localhost.
//
//   node e2e/anthropic-stand-in.mjs
//
// Scripted behaviour, from the latest user text:
// - mentions "worksheet": asks for the search_resources tool, then answers with the first result line;
// - mentions "refuse": returns a refusal;
// - anything else: echoes the question and the commission rate it was told.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.ANTHROPIC_STAND_IN_PORT ?? 4011);
let lastRequest = null;

const id = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString();
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const textOf = (content) =>
  typeof content === "string" ? content : content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

function message(content, stop_reason = "end_turn") {
  return {
    id: id("msg"), type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

function reply(body) {
  const last = body.messages.at(-1);
  // A tool result came back: answer from it.
  if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
    const result = last.content[0].content;
    const text = typeof result === "string" ? result : textOf(result);
    const first = text.split("\n").find((l) => l.startsWith("- ")) ?? "nothing matched";
    return message([{ type: "text", text: `Here is one I found:\n${first.slice(2)}` }]);
  }
  const question = textOf(last.content);
  if (/refuse/i.test(question)) return message([], "refusal");
  if (/worksheet/i.test(question)) {
    return message([{ type: "tool_use", id: id("toolu"), name: "search_resources", input: { query: "fractions worksheet" } }], "tool_use");
  }
  const system = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : String(body.system ?? "");
  const fee = system.match(/GuroMart keeps (\d+)%/)?.[1] ?? "?";
  return message([{ type: "text", text: `Stand-in answer to "${question}". Sellers keep ${100 - Number(fee)}%. See /refunds for refunds.` }]);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "POST" && url.pathname === "/v1/messages") {
      if (!req.headers["x-api-key"]) return send(res, 401, { type: "error", error: { type: "authentication_error", message: "missing key" } });
      const body = JSON.parse(await readBody(req));
      lastRequest = { headers: { "anthropic-beta": req.headers["anthropic-beta"] ?? null }, body };
      return send(res, 200, reply(body));
    }
    if (req.method === "GET" && url.pathname === "/last-request") return send(res, 200, lastRequest ?? {});
    send(res, 404, { type: "error", error: { type: "not_found_error", message: "not found" } });
  } catch (e) {
    send(res, 500, { type: "error", error: { type: "api_error", message: String(e) } });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Anthropic stand-in on http://127.0.0.1:${PORT}`));
