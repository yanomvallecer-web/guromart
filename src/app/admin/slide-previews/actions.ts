"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { BUCKET, MAX_PREVIEWS, checkUpload, objectPath } from "@/lib/listings/uploads";
import { discardObject, verifyStoredObject } from "@/lib/listings/verify-object";
import { createAdminClient } from "@/lib/supabase/admin";

const id = z.uuid();

async function listing(productId: string) {
  await requireArea("admin", "/admin/slide-previews");
  if (!id.safeParse(productId).success) throw new Error("Unknown listing.");
  const { data } = await createAdminClient()
    .from("products")
    .select("id, slug, storefronts(seller_account_id), product_previews(sort_order)")
    .eq("id", productId)
    .maybeSingle();
  if (!data) throw new Error("Unknown listing.");
  const row = data as unknown as { slug: string; storefronts: { seller_account_id: string } | null; product_previews: { sort_order: number }[] };
  if (!row.storefronts) throw new Error("Unknown listing.");
  return { slug: row.slug, sellerAccountId: row.storefronts.seller_account_id, orders: row.product_previews.map((p) => p.sort_order) };
}

/** A short-lived link to a listing's PowerPoint, for staff whose browser draws its slides. */
export async function deckLink(productId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await listing(productId);
  if (!id.safeParse(fileId).success) return { ok: false, error: "Unknown file." };
  const admin = createAdminClient();
  const { data: file } = await admin.from("product_files").select("storage_path, file_format").eq("id", fileId).eq("product_id", productId).maybeSingle();
  if (!file || file.file_format !== "pptx") return { ok: false, error: "That file isn't a PowerPoint on this listing." };
  const { data, error } = await admin.storage.from(BUCKET.file).createSignedUrl(file.storage_path, 120);
  if (error || !data) return { ok: false, error: "Couldn't open the file." };
  return { ok: true, url: data.signedUrl };
}

/** A one-time upload link for one slide picture, in the seller's own preview folder. */
export async function slideTicket(productId: string, name: string, size: number): Promise<{ ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }> {
  const { sellerAccountId, orders } = await listing(productId);
  if (orders.length >= MAX_PREVIEWS) return { ok: false, error: `Already has ${MAX_PREVIEWS} previews.` };
  const check = checkUpload("preview", name, size);
  if (!check.ok) return check;
  const path = objectPath(sellerAccountId, productId, check.value.ext);
  const { data, error } = await createAdminClient().storage.from(BUCKET.preview).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Uploads are unavailable right now." };
  return { ok: true, path, token: data.token, bucket: BUCKET.preview };
}

/** Checks the uploaded slide picture and adds it after the listing's existing previews. */
export async function confirmSlide(productId: string, path: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { slug, sellerAccountId, orders } = await listing(productId);
  if (typeof path !== "string" || !path.startsWith(`${sellerAccountId}/${productId}/`) || path.includes("..")) return { ok: false, error: "That upload doesn't belong to this listing." };
  const checked = await verifyStoredObject("preview", path, name);
  if (!checked.ok) return checked;
  const { error } = await createAdminClient()
    .from("product_previews")
    .insert({ product_id: productId, storage_path: path, alt_text: null, sort_order: orders.length ? Math.max(...orders) + 1 : 0 });
  if (error) {
    await discardObject("preview", path);
    return { ok: false, error: error.message.includes("at most") ? error.message : "Couldn't attach the picture." };
  }
  updateTag("products");
  updateTag(`product:${slug}`);
  return { ok: true };
}
