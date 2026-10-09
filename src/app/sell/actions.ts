"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { startSellingSchema } from "@/lib/validation/seller";

export type StartSellingState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function startSelling(_prev: StartSellingState, formData: FormData): Promise<StartSellingState> {
  await requireViewer("/sell");
  const parsed = startSellingSchema.safeParse({
    seller_type: formData.get("seller_type"),
    store_name: formData.get("store_name"),
    store_slug: formData.get("store_slug"),
    agree: formData.get("agree"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  // The database function creates the seller account, storefront and role
  // for the signed-in user only, in one transaction.
  const { error } = await supabase.rpc("start_selling", {
    p_seller_type: parsed.data.seller_type,
    p_store_name: parsed.data.store_name,
    p_store_slug: parsed.data.store_slug,
    p_agree_to_terms: true,
  });
  if (error) {
    if (error.message.includes("taken")) return { fieldErrors: { store_slug: ["That shop address is taken. Try another."] } };
    if (error.message.includes("already have")) redirect("/seller");
    return { error: "We couldn't open your shop. Please try again." };
  }
  redirect("/seller");
}
