"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { saved?: boolean; error?: string };

const id = z.uuid();
const safePath = (path: string) => (typeof path === "string" && /^\/[a-z0-9/_-]*$/i.test(path) ? path : "/");
const SLUG = /^[a-z0-9-]{1,160}$/;

/** A review changes the resource's star rating, which cards and the resource page cache. */
function refreshRatings(slug: string) {
  if (!SLUG.test(slug)) return;
  updateTag("products");
  updateTag(`product:${slug}`);
  revalidatePath(`/resources/${slug}`);
}

/** Adds a resource to the viewer's Saved list, or takes it off. RLS keeps each list private to its owner. */
export async function toggleSaved(productId: string, save: boolean, path: string): Promise<SaveState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in to save resources." };
  if (!id.safeParse(productId).success) return { error: "Unknown resource." };
  const supabase = await createClient();
  const { error } = save
    ? await supabase.from("wishlists").upsert({ user_id: viewer.id, product_id: productId }, { onConflict: "user_id,product_id", ignoreDuplicates: true })
    : await supabase.from("wishlists").delete().eq("user_id", viewer.id).eq("product_id", productId);
  if (error) return { error: "We couldn't update your saved list. Please try again." };
  revalidatePath(safePath(path));
  revalidatePath("/library");
  return { saved: save };
}

export type ReviewFormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  body: z.string().trim().max(2000, "Keep your review under 2,000 characters."),
});

/**
 * Writes or updates the viewer's one review of a resource. The database only
 * accepts it from someone with the resource in their library who isn't its
 * seller, so every review comes from a real buyer or downloader.
 */
export async function saveReview(productId: string, slug: string, _prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in to review this resource." };
  if (!id.safeParse(productId).success) return { error: "Unknown resource." };
  const parsed = reviewSchema.safeParse({ rating: form.get("rating"), body: form.get("body") ?? "" });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("reviews").select("id").eq("product_id", productId).eq("user_id", viewer.id).maybeSingle();
  const values = { rating: parsed.data.rating, body: parsed.data.body || null };
  const { error } = existing
    ? await supabase.from("reviews").update(values).eq("id", existing.id)
    : await supabase.from("reviews").insert({ ...values, product_id: productId, user_id: viewer.id });
  if (error) {
    if (error.code === "42501") return { error: "Only teachers with this resource in their library can review it." };
    return { error: "We couldn't save your review. Please try again." };
  }
  refreshRatings(slug);
  return { ok: true };
}

export async function deleteReview(productId: string, slug: string): Promise<ReviewFormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in first." };
  if (!id.safeParse(productId).success) return { error: "Unknown resource." };
  const supabase = await createClient();
  const { error } = await supabase.from("reviews").delete().eq("product_id", productId).eq("user_id", viewer.id);
  if (error) return { error: "We couldn't remove your review. Please try again." };
  refreshRatings(slug);
  return { ok: true };
}

const replySchema = z.string().trim().max(1000, "Keep the reply under 1,000 characters.");

/** The seller's public reply under one review. An empty reply removes it. The database checks the caller sells the resource. */
export async function replyToReview(reviewId: string, slug: string, _prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in first." };
  if (!id.safeParse(reviewId).success) return { error: "Unknown review." };
  const parsed = replySchema.safeParse(form.get("reply") ?? "");
  if (!parsed.success) return { fieldErrors: { reply: parsed.error.issues.map((i) => i.message) } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_to_review", { p_review_id: reviewId, p_reply: parsed.data });
  if (error) return { error: error.code === "42501" ? "Only the seller of this resource can reply." : "We couldn't save your reply. Please try again." };
  refreshRatings(slug);
  return { ok: true };
}
