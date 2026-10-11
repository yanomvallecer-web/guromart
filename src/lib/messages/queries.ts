import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConversationSummary = {
  id: string;
  role: "buyer" | "seller";
  other_name: string;
  product_title: string | null;
  product_slug: string | null;
  last_message_at: string | null;
  last_body: string | null;
  unread: boolean;
  reported: boolean;
};

export type ConversationHeader = {
  id: string;
  role: "buyer" | "seller" | "staff";
  buyer_name: string;
  shop_name: string;
  shop_slug: string;
  product_title: string | null;
  product_slug: string | null;
  reported: boolean;
  report_reason: string | null;
};

export type Message = { id: string; sender_id: string; body: string; created_at: string };

/** The viewer's conversations as a teacher and as a seller, newest first. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw new Error(`Could not load your messages: ${error.message}`);
  return data as ConversationSummary[];
}

/** One conversation and its messages, or null when the viewer can't read it (RLS). */
export async function getConversation(id: string): Promise<{ header: ConversationHeader; messages: Message[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data: header } = await supabase.rpc("conversation_header", { p_conversation_id: id }).maybeSingle<ConversationHeader>();
  if (!header) return null;
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Could not load messages: ${error.message}`);
  return { header, messages: data };
}
