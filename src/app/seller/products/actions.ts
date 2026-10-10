"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { getTaxonomy } from "@/lib/catalog/queries";
import { slugify } from "@/lib/format";
import { listingFromForm, reviewProblems } from "@/lib/listings/schema";
import { getSellerContext } from "@/lib/listings/seller";
import { BUCKET, type UploadKind, checkUpload, cleanFileName, objectPath } from "@/lib/listings/uploads";
import { discardObject, verifyStoredObject } from "@/lib/listings/verify-object";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function seller() {
  const viewer = await requireArea("seller", "/seller/products");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  return ctx;
}

const idSchema = z.uuid();

/** Loads the caller's own listing (RLS) with what the checks below need. */
async function ownListing(id: string) {
  const ctx = await seller();
  if (!idSchema.safeParse(id).success) throw new Error("Unknown listing.");
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, status, storefront_id")
    .eq("id", id)
    .eq("storefront_id", ctx.storefront.id)
    .maybeSingle();
  if (!data) throw new Error("Unknown listing.");
  return { ctx, supabase, listing: data };
}

const EDITABLE = new Set(["draft", "rejected", "pending_review", "published"]);
const MEDIA_EDITABLE = new Set(["draft", "rejected", "pending_review"]);

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]>; problems?: string[] };

const newListingSchema = z.object({
  title: z.string().trim().min(4, "Use at least 4 characters.").max(160, "Keep the title under 160 characters."),
  category: z.string().regex(/^[a-z0-9-]{1,60}$/, "Choose a resource type."),
});

export async function createListing(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await seller();
  const parsed = newListingSchema.safeParse({ title: form.get("title"), category: form.get("category") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const taxonomy = await getTaxonomy();
  const category = taxonomy.categories.find((c) => c.code === parsed.data.category);
  if (!category) return { fieldErrors: { category: ["Choose a resource type."] } };

  const supabase = await createClient();
  const slug = `${slugify(parsed.data.title, 100) || "resource"}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase
    .from("products")
    .insert({ storefront_id: ctx.storefront.id, slug, title: parsed.data.title, category_id: category.id, status: "draft" })
    .select("id")
    .single();
  if (error) return { error: "We couldn't create the listing. Please try again." };
  redirect(`/seller/products/${data.id}`);
}

export async function saveListing(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, listing } = await ownListing(id);
  if (!EDITABLE.has(listing.status)) return { error: "This listing can't be edited right now." };
  const parsed = listingFromForm(form);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const t = await getTaxonomy();
  const idOf = (list: { id: number; code: string }[], code: string | null) => (code ? (list.find((i) => i.code === code)?.id ?? null) : null);
  const categoryId = idOf(t.categories, v.category);
  if (!categoryId) return { fieldErrors: { category: ["Choose a resource type."] } };
  const gradeIds = v.grades.map((g) => idOf(t.grades, g)).filter((g): g is number => g !== null);
  const language = v.language && t.languages.some((l) => l.code === v.language) ? v.language : null;

  const { data: current } = await supabase.from("products").select("copyright_declared_at").eq("id", id).single();
  const { error } = await supabase
    .from("products")
    .update({
      title: v.title,
      summary: v.summary,
      description: v.description,
      category_id: categoryId,
      subject_id: idOf(t.subjects, v.subject),
      curriculum_id: idOf(t.curricula, v.curriculum),
      academic_period_id: idOf(t.periods, v.period),
      period_detail: v.period_detail,
      topic: v.topic,
      learning_competency: v.learning_competency,
      language_code: language,
      price_centavos: v.price,
      page_count: v.page_count,
      is_editable: v.is_editable,
      license_type: v.license_type,
      license_terms: v.license_terms,
      copyright_declared_at: v.copyright_declared ? (current?.copyright_declared_at ?? new Date().toISOString()) : null,
    })
    .eq("id", id);
  if (error) {
    if (error.message.includes("check constraint") && !v.copyright_declared) {
      return { fieldErrors: { copyright_declared: ["Listings in review must keep the rights confirmation."] } };
    }
    return { error: "We couldn't save your changes. Please try again." };
  }

  const del = await supabase.from("product_grade_levels").delete().eq("product_id", id);
  const ins = gradeIds.length
    ? await supabase.from("product_grade_levels").insert(gradeIds.map((g) => ({ product_id: id, grade_level_id: g })))
    : { error: null };
  if (del.error || ins.error) return { error: "Saved, but the grade levels didn't update. Please try again." };

  revalidatePath(`/seller/products/${id}`);
  return { ok: true };
}

export async function submitListing(id: string): Promise<ActionState> {
  const { supabase, listing } = await ownListing(id);
  if (!["draft", "rejected"].includes(listing.status)) return { error: "This listing is already in review or live." };
  const { data } = await supabase
    .from("products")
    .select("title, topic, description, category_id, subject_id, copyright_declared_at, product_grade_levels(grade_level_id), product_files(id), product_previews(id)")
    .eq("id", id)
    .single();
  if (!data) return { error: "Unknown listing." };
  const problems = reviewProblems({
    title: data.title,
    topic: data.topic,
    description: data.description,
    category_id: data.category_id,
    subject_id: data.subject_id,
    grade_count: data.product_grade_levels.length,
    file_count: data.product_files.length,
    preview_count: data.product_previews.length,
    copyright_declared: Boolean(data.copyright_declared_at),
  });
  if (problems.length) return { problems };
  const { error } = await supabase.from("products").update({ status: "pending_review" }).eq("id", id);
  if (error) return { error: "We couldn't submit the listing. Please try again." };
  revalidatePath(`/seller/products/${id}`);
  return { ok: true };
}

export async function setListingStatus(id: string, status: "draft" | "archived"): Promise<ActionState> {
  const { supabase, listing } = await ownListing(id);
  if (listing.status === "suspended") return { error: "This listing is suspended. Contact GuroMart support." };
  const { error } = await supabase.from("products").update({ status }).eq("id", id);
  if (error) return { error: "We couldn't update the listing. Please try again." };
  revalidatePath(`/seller/products/${id}`);
  revalidatePath("/seller/products");
  if (status === "archived") redirect("/seller/products");
  return { ok: true };
}

const ticketSchema = z.object({
  kind: z.enum(["file", "preview"]),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

export type UploadTicket = { ok: true; path: string; token: string; bucket: string; contentType: string } | { ok: false; error: string };

/** Step 1: authorize an upload and hand back a one-time signed upload URL for an owner-scoped path. */
export async function createUploadTicket(id: string, input: { kind: UploadKind; name: string; size: number }): Promise<UploadTicket> {
  const { ctx, listing } = await ownListing(id);
  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file can't be uploaded." };
  if (!MEDIA_EDITABLE.has(listing.status)) return { ok: false, error: "Withdraw the listing to a draft before changing its files." };
  const check = checkUpload(parsed.data.kind, parsed.data.name, parsed.data.size);
  if (!check.ok) return check;

  const path = objectPath(ctx.sellerAccountId, id, check.value.ext);
  const bucket = BUCKET[parsed.data.kind];
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Uploads are unavailable right now. Please try again." };
  return { ok: true, path, token: data.token, bucket, contentType: check.value.mime };
}

/** Step 2: after the browser uploads, check the stored object and record it. Rejected objects are deleted. */
export async function confirmUpload(id: string, input: { kind: UploadKind; path: string; name: string }): Promise<ActionState> {
  const { ctx, supabase } = await ownListing(id);
  const kind = input.kind === "preview" ? "preview" : "file";
  const prefix = `${ctx.sellerAccountId}/${id}/`;
  if (typeof input.path !== "string" || !input.path.startsWith(prefix) || input.path.includes("..")) {
    return { error: "That upload doesn't belong to this listing." };
  }
  const checked = await verifyStoredObject(kind, input.path, input.name);
  if (!checked.ok) return { error: checked.error };

  const row =
    kind === "file"
      ? await supabase.from("product_files").insert({
          product_id: id,
          storage_path: input.path,
          original_filename: cleanFileName(input.name),
          mime_type: checked.type.mime,
          file_format: checked.type.format,
          size_bytes: checked.size,
        })
      : await supabase.from("product_previews").insert({ product_id: id, storage_path: input.path, alt_text: null, sort_order: await nextPreviewOrder(supabase, id) });
  if (row.error) {
    await discardObject(kind, input.path);
    return { error: row.error.message.includes("at most") ? row.error.message : "We couldn't attach the file. Please try again." };
  }
  revalidatePath(`/seller/products/${id}`);
  return { ok: true };
}

/** A short-lived link to one of the seller's own uploaded PowerPoints, so their browser can draw slide previews from it. */
export async function ownPowerPointUrl(id: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { supabase } = await ownListing(id);
  if (!idSchema.safeParse(fileId).success) return { ok: false, error: "Unknown file." };
  const { data: file } = await supabase.from("product_files").select("storage_path, file_format").eq("id", fileId).eq("product_id", id).maybeSingle();
  if (!file || file.file_format !== "pptx") return { ok: false, error: "That file isn't a PowerPoint on this listing." };
  const { data, error } = await createAdminClient().storage.from(BUCKET.file).createSignedUrl(file.storage_path, 120);
  if (error || !data) return { ok: false, error: "We couldn't open the file. Please try again." };
  return { ok: true, url: data.signedUrl };
}

/** New previews go after the existing ones, so they show in the order they were added. */
async function nextPreviewOrder(supabase: Awaited<ReturnType<typeof ownListing>>["supabase"], id: string) {
  const { data } = await supabase.from("product_previews").select("sort_order").eq("product_id", id).order("sort_order", { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? -1) + 1;
}

export async function removeMedia(id: string, kind: UploadKind, mediaId: string): Promise<ActionState> {
  const { supabase, listing } = await ownListing(id);
  if (!MEDIA_EDITABLE.has(listing.status)) return { error: "Withdraw the listing to a draft before changing its files." };
  if (!idSchema.safeParse(mediaId).success) return { error: "Unknown file." };
  const table = kind === "preview" ? "product_previews" : "product_files";
  const { data, error } = await supabase.from(table).delete().eq("id", mediaId).eq("product_id", id).select("storage_path").maybeSingle();
  if (error || !data) return { error: "We couldn't remove that file." };
  await createAdminClient().storage.from(BUCKET[kind === "preview" ? "preview" : "file"]).remove([data.storage_path]);
  revalidatePath(`/seller/products/${id}`);
  return { ok: true };
}
