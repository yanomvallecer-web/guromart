"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { getSellerContext } from "@/lib/listings/seller";
import { BUCKET, checkUpload } from "@/lib/listings/uploads";
import { discardObject, verifyStoredObject } from "@/lib/listings/verify-object";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { payoutSchema, verificationKind } from "@/lib/validation/payout";

async function seller() {
  const viewer = await requireArea("seller", "/seller/verify");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  return ctx;
}

async function verificationStatus(sellerAccountId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("seller_accounts").select("verification_status").eq("id", sellerAccountId).single();
  return data?.verification_status as string | undefined;
}

export type IdTicket = { ok: true; path: string; token: string; bucket: string; contentType: string } | { ok: false; error: string };

/** Authorizes one ID upload into the seller's own private folder. */
export async function createIdTicket(input: { name: string; size: number }): Promise<IdTicket> {
  const ctx = await seller();
  const status = await verificationStatus(ctx.sellerAccountId);
  if (status === "verified") return { ok: false, error: "Your identity is already verified." };
  if (status === "pending") return { ok: false, error: "Your ID is already being reviewed." };
  const check = checkUpload("verification", String(input?.name ?? ""), Number(input?.size));
  if (!check.ok) return check;
  const path = `${ctx.sellerAccountId}/${crypto.randomUUID()}.${check.value.ext}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET.verification).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Uploads are unavailable right now. Please try again." };
  return { ok: true, path, token: data.token, bucket: BUCKET.verification, contentType: check.value.mime };
}

export type VerifyState = { ok?: boolean; error?: string };

/** Checks the uploaded ID and opens a review request. */
export async function submitId(input: { kind: string; path: string; name: string }): Promise<VerifyState> {
  const ctx = await seller();
  const kind = verificationKind.safeParse(input?.kind);
  if (!kind.success) return { error: "Choose the type of ID." };
  const path = String(input?.path ?? "");
  if (!path.startsWith(`${ctx.sellerAccountId}/`) || path.includes("..") || path.split("/").length !== 2) {
    return { error: "That upload doesn't belong to your account." };
  }
  const checked = await verifyStoredObject("verification", path, String(input?.name ?? ""));
  if (!checked.ok) return { error: checked.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("seller_verifications")
    .insert({ seller_account_id: ctx.sellerAccountId, kind: kind.data, document_path: path });
  if (error) {
    await discardObject("verification", path);
    return { error: error.code === "23505" ? "Your ID is already being reviewed." : "We couldn't send your ID for review. Please try again." };
  }
  revalidatePath("/seller/verify");
  revalidatePath("/seller");
  return { ok: true };
}

export type PayoutState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

export async function savePayout(_prev: PayoutState, form: FormData): Promise<PayoutState> {
  const ctx = await seller();
  const parsed = payoutSchema.safeParse({
    method: form.get("method"),
    account_name: form.get("account_name") ?? "",
    account_number: form.get("account_number") ?? "",
    bank_name: form.get("bank_name") ?? "",
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("seller_payout_methods")
    .select("id")
    .eq("seller_account_id", ctx.sellerAccountId)
    .eq("is_default", true)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("seller_payout_methods").update(parsed.data).eq("id", existing.id)
    : await supabase.from("seller_payout_methods").insert({ ...parsed.data, seller_account_id: ctx.sellerAccountId, is_default: true });
  if (error) return { error: "We couldn't save your payout details. Please try again." };
  revalidatePath("/seller/verify");
  revalidatePath("/seller");
  return { ok: true };
}
