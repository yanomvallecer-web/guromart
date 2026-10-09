"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/dal";
import { isMissingFunction } from "@/lib/commerce/buy-now";
import { expireStaleOrders } from "@/lib/commerce/orders";
import { safeNextPath } from "@/lib/auth/roles";
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

  return openCheckout(order, config, viewer.email, `${siteUrl()}/cart`);
}

const siteUrl = () => publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

/**
 * Buy now: an order for this one resource, then PayMongo. Other items in the
 * cart are not charged and stay there. Nothing is unlocked here: access waits
 * for the verified webhook, exactly as with checkout from the cart.
 */
export async function buyNow(productId: string, from: string): Promise<CartActionState> {
  // Only a resource page can be the "back" address PayMongo returns to.
  const path = /^\/resources\/[a-z0-9-]{1,120}$/.test(safeNextPath(from)) ? from : "/cart";
  const viewer = await requireViewer(path);
  if (!idSchema.safeParse(productId).success) return { error: "This resource is not available." };
  const config = paymongoConfig();
  if (!config) return { error: "Online payment isn't set up yet. Add it to your cart instead." };

  const supabase = await createClient();
  await expireStaleOrders(supabase);
  const { data: order, error } = await supabase
    .rpc("create_order_for_product", { p_product_id: productId })
    .single<{ order_id: string; order_number: string; total_centavos: number }>();
  if (error && isMissingFunction(error)) {
    console.error("Buy now failed: create_order_for_product() is missing. Run guromart-setup/ux-buy-now.sql.");
    return { error: "Buy now isn't available yet. Add it to your cart and check out from there." };
  }
  if (error || !order) return { error: friendly(error?.message, "We couldn't start checkout. Please try again.") };
  return openCheckout(order, config, viewer.email, `${siteUrl()}${path}`);
}

/** Opens a PayMongo checkout for an order the database just created, and sends the buyer there. */
async function openCheckout(
  order: { order_id: string; order_number: string; total_centavos: number },
  config: NonNullable<ReturnType<typeof paymongoConfig>>,
  email: string | null,
  cancelUrl: string,
): Promise<CartActionState> {
  const admin = createAdminClient();
  const { data: items } = await admin
    .from("order_items")
    .select("title_snapshot, unit_price_centavos")
    .eq("order_id", order.order_id)
    .order("created_at");

  let session: Awaited<ReturnType<typeof createCheckoutSession>>;
  try {
    session = await createCheckoutSession(config, {
      orderNumber: order.order_number,
      lines: (items ?? []).map((i) => ({ name: i.title_snapshot, amountCentavos: i.unit_price_centavos })),
      successUrl: `${siteUrl()}/orders/${order.order_number}?from=checkout`,
      cancelUrl,
      email,
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
