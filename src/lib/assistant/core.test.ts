import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, helperConfig, historySchema, linkify, systemPrompt } from "./core";

describe("helperConfig", () => {
  it("is off without a key and only talks to Anthropic or a local stand-in", () => {
    expect(helperConfig({})).toBeNull();
    expect(helperConfig({ ANTHROPIC_API_KEY: "k" })).toEqual({ apiKey: "k", baseURL: "https://api.anthropic.com" });
    expect(helperConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "http://127.0.0.1:4011/" })?.baseURL).toBe("http://127.0.0.1:4011");
    expect(() => helperConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://evil.example.com" })).toThrow(/ANTHROPIC_BASE_URL/);
  });
});

describe("historySchema", () => {
  const q = (text: string) => ({ role: "user" as const, text });
  const a = (text: string) => ({ role: "assistant" as const, text });

  it("accepts alternating turns that end with a question", () => {
    expect(historySchema.parse([q(" Hi "), a("Hello"), q("Refunds?")])).toEqual([q("Hi"), a("Hello"), q("Refunds?")]);
  });

  it("rejects chats out of order, empty or ending with an answer", () => {
    expect(historySchema.safeParse([]).success).toBe(false);
    expect(historySchema.safeParse([q("a"), q("b")]).success).toBe(false);
    expect(historySchema.safeParse([q("a"), a("b")]).success).toBe(false);
    expect(historySchema.safeParse([q("x".repeat(1001))]).success).toBe(false);
  });

  it("keeps only the latest turns, starting with a question", () => {
    const long = Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? q(`q${i}`) : a(`a${i}`)));
    const kept = historySchema.parse(long);
    expect(kept.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(kept[0].role).toBe("user");
    expect(kept.at(-1)).toEqual(q("q24"));
  });
});

describe("systemPrompt", () => {
  it("states the live fee and payout rules", () => {
    const text = systemPrompt({ feePercent: 10, minPayoutPesos: 500, holdDays: 7, paymentMethods: "QR Ph", contactEmail: "help@example.test" });
    expect(text).toContain("GuroMart keeps 10% of each sale and the seller keeps 90%");
    expect(text).toContain("held 7 days");
    expect(text).toContain("₱500");
    expect(text).toContain("help@example.test");
  });
});

describe("linkify", () => {
  it("links site paths and leaves other text alone", () => {
    expect(linkify("See /refunds, or /resources/grade-4-fractions.")).toEqual([
      { text: "See " },
      { text: "Refund policy", href: "/refunds" },
      { text: ", or " },
      { text: "View resource", href: "/resources/grade-4-fractions" },
      { text: "." },
    ]);
    expect(linkify("**Bold** and 1/2 and https://x.test/refunds")).toEqual([{ text: "Bold and 1/2 and https://x.test/refunds" }]);
  });
});
