"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead() {
  const viewer = await requireViewer("/notifications");
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).is("read_at", null);
  revalidatePath("/", "layout");
}

/** Marks one notification read and opens what it points to. */
export async function openNotification(id: string) {
  const viewer = await requireViewer("/notifications");
  if (!z.uuid().safeParse(id).success) redirect("/notifications");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", viewer.id)
    .select("link_path")
    .maybeSingle();
  revalidatePath("/", "layout");
  redirect(safeNextPath(data?.link_path, "/notifications"));
}
