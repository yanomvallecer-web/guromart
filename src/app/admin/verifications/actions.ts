"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type DecisionState = { ok?: boolean; error?: string };

export async function decideVerification(verificationId: string, _prev: DecisionState, form: FormData): Promise<DecisionState> {
  await requireArea("admin", "/admin/verifications");
  if (!z.uuid().safeParse(verificationId).success) return { error: "Unknown request." };
  const decision = form.get("decision");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000);
  if (decision !== "approve" && decision !== "reject") return { error: "Choose approve or reject." };
  if (decision === "reject" && notes.length < 10) return { error: "Tell the seller what to fix (at least 10 characters)." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_verification", {
    p_verification_id: verificationId,
    p_approve: decision === "approve",
    p_notes: notes || null,
  });
  if (error) return { error: error.code === "22023" ? error.message : "We couldn't save the decision. Please try again." };
  revalidatePath("/admin/verifications");
  revalidatePath("/admin");
  return { ok: true };
}
