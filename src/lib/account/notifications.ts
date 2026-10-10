import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Notification = { id: string; type: string; title: string; body: string | null; link_path: string | null; read_at: string | null; created_at: string };

/** Unread in-app notifications for the signed-in user (RLS limits rows to their own). */
export const getUnreadCount = cache(async (userId: string): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
});

export async function listNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link_path, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  return data;
}
