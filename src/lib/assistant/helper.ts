import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { browseProducts } from "@/lib/catalog/queries";
import { displayTitle, gradeSummary } from "@/lib/catalog/labels";
import { formatPrice } from "@/lib/format";
import { paymentMethodsSentence } from "@/lib/payments/paymongo";
import { getSellerPlans } from "@/lib/platform-settings";
import { CONTACT_EMAIL } from "@/lib/site";
import { HELPER_MODEL, helperConfig, systemPrompt, type HelperTurn } from "./core";

const SEARCH_TOOL: Anthropic.Beta.BetaTool = {
  name: "search_resources",
  description:
    "Searches live GuroMart resources (lesson plans, worksheets, slides and more) by keywords such as topic, subject, grade or format. Returns up to 5 matches with title, price, grades, shop and page path. Use it whenever the teacher wants resource suggestions.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Search words, e.g. 'grade 4 fractions worksheet' or 'Filipino pang-uri'." } },
    required: ["query"],
    additionalProperties: false,
  },
  strict: true,
};

async function searchResources(input: unknown): Promise<string> {
  const query = typeof (input as { query?: unknown })?.query === "string" ? (input as { query: string }).query.trim().slice(0, 120) : "";
  if (!query) return "No search words were given.";
  const { items, total } = await browseProducts({ q: query });
  if (!items.length) return `No live resources match "${query}". Suggest other words or browsing /browse.`;
  const lines = items.slice(0, 5).map((p) => {
    const grades = gradeSummary(p.grades);
    const rating = p.rating_count ? `, rated ${p.rating_avg.toFixed(1)} from ${p.rating_count} reviews` : "";
    return `- ${displayTitle(p)} (${formatPrice(p.price_centavos)}${grades ? `, ${grades}` : ""}${p.storefront ? `, by ${p.storefront.name}` : ""}${rating}): /resources/${p.slug}`;
  });
  return `${total} resources match "${query}". Top results:\n${lines.join("\n")}\nMore: /browse?q=${encodeURIComponent(query)}`;
}

export type HelperAnswer = { text: string } | { error: string };

/**
 * Answers the teacher's latest question. Uses server-side fallbacks so a
 * request the main model declines is retried on Anthropic's recommended
 * fallback model, and runs the resource search when the model asks for it.
 */
export async function answer(history: HelperTurn[]): Promise<HelperAnswer> {
  const config = helperConfig();
  if (!config) return { error: "The GuroMart helper isn't available yet." };
  const plans = await getSellerPlans();
  const system = systemPrompt({
    feePercent: plans.starterBps / 100,
    minPayoutPesos: plans.minPayoutCentavos / 100,
    holdDays: plans.holdDays,
    paymentMethods: paymentMethodsSentence(),
    contactEmail: CONTACT_EMAIL,
  });
  const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 2, timeout: 60_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));

  try {
    // A question needs at most a couple of searches; stop well before a runaway loop.
    for (let round = 0; round < 4; round++) {
      const response = await client.beta.messages.create({
        model: HELPER_MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: [SEARCH_TOOL],
        messages,
      });
      if (response.stop_reason === "refusal") {
        return { error: `The helper can't answer that one. For help with GuroMart, email ${CONTACT_EMAIL}.` };
      }
      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          results.push(
            block.name === "search_resources"
              ? { type: "tool_result", tool_use_id: block.id, content: await searchResources(block.input) }
              : { type: "tool_result", tool_use_id: block.id, content: "Unknown tool.", is_error: true },
          );
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) return { text };
      break;
    }
    return { error: "The helper couldn't finish that answer. Please ask again in fewer words." };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      return { error: "The helper is busy right now. Please try again in a minute." };
    }
    console.error("GuroMart helper failed:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return { error: "The helper isn't working right now. Please try again later." };
  }
}
