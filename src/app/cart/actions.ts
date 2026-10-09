"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/dal";
import { expireStaleOrders } from "@/lib/commerce/orders";
import { publicEnv } from "@/lib/env";
import { createCheckoutSession, paymongoConfig } from "@/lib/payments/paymongo";
import { createAdminClient } from "@/lib/supabase/admin";
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
    "nothing to pay for",
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

/**
 * Creates an order from the cart at current prices and sends the buyer to
 * PayMongo. Nothing is unlocked here: access waits for the verified webhook.
 */
export async function startCheckout(): Promise<CartActionState> {
  const viewer = await requireViewer("/cart");
  const config = paymongoConfig();
  if (!config) return { error: "Online payment isn't set up yet. Your cart is saved." };

  const supabase = await createClient();
  await expireStaleOrders(supabase);
  const { data: order, error } = await supabase.rpc("create_order_from_cart").single<{ order_id: string; order_number: string; total_centavos: number }>();
  if (error || !order) return { error: friendly(error?.message, "We couldn't start checkout. Please try again.") };

  const admin = createAdminClient();
  const { data: items } = await admin
    .from("order_items")
    .select("title_snapshot, unit_price_centavos")
    .eq("order_id", order.order_id)
    .order("created_at");
  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  let session: Awaited<ReturnType<typeof createCheckoutSession>>;
  try {
    session = await createCheckoutSession(config, {
      orderNumber: order.order_number,
      lines: (items ?? []).map((i) => ({ name: i.title_snapshot, amountCentavos: i.unit_price_centavos })),
      successUrl: `${site}/orders/${order.order_number}?from=checkout`,
      cancelUrl: `${site}/cart`,
      email: viewer.email,
    });
  } catch (e) {
    console.error("Checkout session failed", { order: order.order_number, error: (e as Error).message });
    await admin.from("orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", order.order_id);
    return { error: "PayMongo couldn't open the payment page. You weren't charged. Please try again." };
  }

  const { error: paymentError } = await admin.from("payments").insert({
    order_id: order.order_id,
    provider: "paymongo",
    provider_checkout_id: session.id,
    provider_payment_intent_id: session.paymentIntentId,
    amount_centavos: order.total_centavos,
    livemode: session.livemode,
  });
  if (paymentError) {
    console.error("Could not record checkout session", { order: order.order_number, error: paymentError.message });
    return { error: "We couldn't start checkout. You weren't charged. Please try again." };
  }
  redirect(session.checkoutUrl);
}
