"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type ReviewState = { ok?: boolean; error?: string };

const id = z.uuid();

/** Records the result of checking one file. The database audits the change. */
export async function markFile(productId: string, fileId: string, result: "clean" | "infected"): Promise<ReviewState> {
  await requireArea("admin", `/admin/listings/${productId}`);
  if (!id.safeParse(productId).success || !id.safeParse(fileId).success || !["clean", "infected"].includes(result)) {
    return { error: "Unknown file." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_files")
    .update({ scan_status: result })
    .eq("id", fileId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "We couldn't record the check. Please try again." };
  revalidatePath(`/admin/listings/${productId}`);
  return { ok: true };
}

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000, "Keep the note under 1,000 characters."),
});

export async function reviewListing(productId: string, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  await requireArea("admin", `/admin/listings/${productId}`);
  if (!id.safeParse(productId).success) return { error: "Unknown listing." };
  const parsed = decisionSchema.safeParse({ decision: form.get("decision"), reason: form.get("reason") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose approve or reject." };
  if (parsed.data.decision === "reject" && parsed.data.reason.length < 10) {
    return { error: "Tell the seller what to fix (at least 10 characters)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_listing", {
    p_product_id: productId,
    p_approve: parsed.data.decision === "approve",
    p_reason: parsed.data.reason || null,
  });
  // The database enforces the rules (files checked clean, still in review) and words its refusals for staff.
  if (error) return { error: error.code === "23514" || error.code === "22023" ? error.message : "We couldn't save the decision. Please try again." };

  revalidatePath("/admin/listings");
  revalidatePath("/admin");
  redirect("/admin/listings");
}
