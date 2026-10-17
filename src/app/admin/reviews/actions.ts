"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/** Hides a review from the public, or shows it again. Hidden reviews stop counting toward the rating. */
export async function setReviewStatus(reviewId: string, status: "published" | "hidden"): Promise<void> {
  await requireArea("admin", "/admin/reviews");
  if (!z.uuid().safeParse(reviewId).success || !["published", "hidden"].includes(status)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").update({ status }).eq("id", reviewId).select("products(slug)").maybeSingle();
  const slug = (data as { products: { slug: string } | null } | null)?.products?.slug;
  updateTag("products");
  if (slug) updateTag(`product:${slug}`);
  revalidatePath("/admin/reviews");
}
