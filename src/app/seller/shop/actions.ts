"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { getSellerContext } from "@/lib/listings/seller";
import { BUCKET, checkUpload } from "@/lib/listings/uploads";
import { discardObject, verifyStoredObject } from "@/lib/listings/verify-object";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { shopProfileSchema } from "@/lib/validation/seller";

async function seller() {
  const viewer = await requireArea("seller", "/seller/shop");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  return ctx;
}

function refresh(slug: string) {
  updateTag(`storefront:${slug}`);
  updateTag("storefronts");
  revalidatePath("/seller/shop");
  revalidatePath("/seller");
}

export type ShopState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

export async function saveShop(_prev: ShopState, form: FormData): Promise<ShopState> {
  const ctx = await seller();
  const parsed = shopProfileSchema.safeParse({
    name: form.get("name") ?? "",
    tagline: form.get("tagline") ?? "",
    description: form.get("description") ?? "",
    is_published: form.get("is_published") === "on",
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.from("storefronts").update(parsed.data).eq("id", ctx.storefront.id);
  if (error) return { error: "We couldn't save your shop. Please try again." };
  refresh(ctx.storefront.slug);
  return { ok: true };
}

const imageSlot = z.enum(["logo", "banner"]);

export type ShopImageTicket = { ok: true; path: string; token: string; bucket: string; contentType: string } | { ok: false; error: string };

export async function createShopImageTicket(input: { name: string; size: number }): Promise<ShopImageTicket> {
  const ctx = await seller();
  const check = checkUpload("shop", String(input?.name ?? ""), Number(input?.size));
  if (!check.ok) return check;
  const path = `${ctx.sellerAccountId}/${crypto.randomUUID()}.${check.value.ext}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET.shop).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Uploads are unavailable right now. Please try again." };
  return { ok: true, path, token: data.token, bucket: BUCKET.shop, contentType: check.value.mime };
}

/** Checks an uploaded image and sets it as the shop's logo or banner, deleting the one it replaces. */
export async function setShopImage(input: { slot: string; path: string; name: string }): Promise<ShopState> {
  const ctx = await seller();
  const slot = imageSlot.safeParse(input?.slot);
  const path = String(input?.path ?? "");
  if (!slot.success || !path.startsWith(`${ctx.sellerAccountId}/`) || path.includes("..") || path.split("/").length !== 2) {
    return { error: "That upload doesn't belong to your shop." };
  }
  const checked = await verifyStoredObject("shop", path, String(input?.name ?? ""));
  if (!checked.ok) return { error: checked.error };

  const column = slot.data === "logo" ? "logo_path" : "banner_path";
  const supabase = await createClient();
  const { data: current } = await supabase.from("storefronts").select("logo_path, banner_path").eq("id", ctx.storefront.id).single();
  const { error } = await supabase.from("storefronts").update({ [column]: path }).eq("id", ctx.storefront.id);
  if (error) {
    await discardObject("shop", path);
    return { error: "We couldn't update your shop image. Please try again." };
  }
  const previous = current?.[column];
  if (previous && previous !== path) await discardObject("shop", previous);
  refresh(ctx.storefront.slug);
  return { ok: true };
}

export async function removeShopImage(slotInput: string): Promise<ShopState> {
  const ctx = await seller();
  const slot = imageSlot.safeParse(slotInput);
  if (!slot.success) return { error: "Unknown image." };
  const column = slot.data === "logo" ? "logo_path" : "banner_path";
  const supabase = await createClient();
  const { data: current } = await supabase.from("storefronts").select("logo_path, banner_path").eq("id", ctx.storefront.id).single();
  const { error } = await supabase.from("storefronts").update({ [column]: null }).eq("id", ctx.storefront.id);
  if (error) return { error: "We couldn't remove the image. Please try again." };
  const previous = current?.[column];
  if (previous) await discardObject("shop", previous);
  refresh(ctx.storefront.slug);
  return { ok: true };
}
