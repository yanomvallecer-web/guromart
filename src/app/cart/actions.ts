"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type CartActionState = { ok?: boolean; error?: string };

const idSchema = z.uuid();

/** Database guard messages are written for teachers; anything else gets a generic message. */
function friendly(message: string | undefined, fallback: string) {
  const known = [
    "not available",
    "is free",
    "your own resource",
    "already in your library",
    "cart is full",
    "not free",
    "access to this resource was removed",
  ];
  return message && known.some((k) => message.includes(k)) ? message.replace(/\.?$/, ".") : fallback;
}

export async function addToCart(productId: string, path: string): Promise<CartActionState> {
  const viewer = await requireViewer(path);
  if (!idSchema.safeParse(productId).success) return { error: "This resource is not available." };
  const supabase = await createClient();

  const { error: cartError } = await supabase.from("carts").upsert({ user_id: viewer.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (cartError) return { error: "We couldn't open your cart. Please try again." };
  const { data: cart } = await supabase.from("carts").select("id").eq("user_id", viewer.id).single();
  if (!cart) return { error: "We couldn't open your cart. Please try again." };

  const { error } = await supabase.from("cart_items").insert({ cart_id: cart.id, product_id: productId });
  // Already in the cart counts as success.
  if (error && error.code !== "23505") return { error: friendly(error.message, "We couldn't add this to your cart. Please try again.") };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeFromCart(productId: string): Promise<CartActionState> {
  const viewer = await requireViewer("/cart");
  if (!idSchema.safeParse(productId).success) return { error: "Unknown resource." };
  const supabase = await createClient();
  const { data: cart } = await supabase.from("carts").select("id").eq("user_id", viewer.id).maybeSingle();
  if (cart) {
    const { error } = await supabase.from("cart_items").delete().eq("cart_id", cart.id).eq("product_id", productId);
    if (error) return { error: "We couldn't remove it. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Adds a free resource to the viewer's library. Paid resources are refused by the database. */
export async function getFreeResource(productId: string, path: string): Promise<CartActionState> {
  await requireViewer(path);
  if (!idSchema.safeParse(productId).success) return { error: "This resource is not available." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_free_product", { p_product_id: productId });
  if (error) return { error: friendly(error.message, "We couldn't add this to your library. Please try again.") };
  revalidatePath("/", "layout");
  return { ok: true };
}
