"use server";

import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { historySchema } from "@/lib/assistant/core";
import { answer } from "@/lib/assistant/helper";

export type AskResult = { text?: string; error?: string; left?: number };

/**
 * One question to the GuroMart helper. The chat itself isn't stored; the
 * database only counts questions so each person stays within the daily limit.
 */
export async function askHelper(history: unknown): Promise<AskResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in to ask the GuroMart helper." };
  const parsed = historySchema.safeParse(history);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please ask again." };

  const supabase = await createClient();
  const { data: left, error } = await supabase.rpc("take_assistant_question");
  if (error) {
    return { error: error.code === "54000" ? error.message : "We couldn't send your question. Please try again.", left: error.code === "54000" ? 0 : undefined };
  }
  const result = await answer(parsed.data);
  return "text" in result ? { text: result.text, left: left as number } : { error: result.error, left: left as number };
}
