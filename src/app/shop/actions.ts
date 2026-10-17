"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type FollowState = { following?: boolean; count?: number; error?: string };

const id = z.uuid();
const safePath = (path: string) => (typeof path === "string" && /^\/[a-z0-9/_-]*$/i.test(path) ? path : "/");

/** Follows a shop, or stops following it. Followers get an in-app notification when the shop publishes something new. */
export async function toggleFollow(storefrontId: string, follow: boolean, path: string): Promise<FollowState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in to follow shops." };
  if (!id.safeParse(storefrontId).success) return { error: "Unknown shop." };
  const supabase = await createClient();
  const { error } = follow
    ? await supabase.from("shop_follows").upsert({ user_id: viewer.id, storefront_id: storefrontId }, { onConflict: "user_id,storefront_id", ignoreDuplicates: true })
    : await supabase.from("shop_follows").delete().eq("user_id", viewer.id).eq("storefront_id", storefrontId);
  if (error) return { error: "We couldn't update this. Please try again." };
  const { data: count } = await supabase.rpc("shop_follower_count", { p_storefront_id: storefrontId });
  revalidatePath(safePath(path));
  return { following: follow, count: typeof count === "number" ? count : undefined };
}
