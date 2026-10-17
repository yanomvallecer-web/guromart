"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, requireArea, requireViewer } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type MessageState = { ok?: boolean; error?: string };

const id = z.uuid();

/** Opens the viewer's conversation with a shop (creating it the first time) and goes there. */
export async function startConversation(storefrontId: string, productId: string | null, from: string): Promise<MessageState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(from))}`);
  if (!id.safeParse(storefrontId).success || (productId && !id.safeParse(productId).success)) return { error: "This shop is not available." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_storefront_id: storefrontId, p_product_id: productId });
  if (error || !data) return { error: error?.message.includes("own shop") ? "This is your own shop." : "We couldn't open the chat. Please try again." };
  redirect(`/messages/${data}`);
}

const bodySchema = z.string().trim().min(1, "Write a message first.").max(2000, "Keep messages under 2,000 characters.");

export async function sendMessage(conversationId: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const viewer = await requireViewer(`/messages/${conversationId}`);
  if (!id.safeParse(conversationId).success) return { error: "Unknown conversation." };
  const parsed = bodySchema.safeParse(form.get("body") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: viewer.id, body: parsed.data });
  if (error) return { error: error.code === "54000" ? error.message : "We couldn't send your message. Please try again." };
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return { ok: true };
}

const reasonSchema = z.string().trim().min(10, "Tell us what happened (at least 10 characters).").max(1000, "Keep it under 1,000 characters.");

/** Flags a conversation for GuroMart staff, who can then read it. */
export async function reportConversation(conversationId: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  await requireViewer(`/messages/${conversationId}`);
  if (!id.safeParse(conversationId).success) return { error: "Unknown conversation." };
  const parsed = reasonSchema.safeParse(form.get("reason") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_conversation", { p_conversation_id: conversationId, p_reason: parsed.data });
  if (error) return { error: "We couldn't send the report. Please try again." };
  revalidatePath(`/messages/${conversationId}`);
  return { ok: true };
}

export async function clearReport(conversationId: string): Promise<void> {
  await requireArea("admin", "/admin/messages");
  if (!id.safeParse(conversationId).success) return;
  const supabase = await createClient();
  await supabase.rpc("clear_conversation_report", { p_conversation_id: conversationId });
  revalidatePath("/admin/messages");
  redirect("/admin/messages");
}
