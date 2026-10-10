"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { slugify } from "@/lib/format";
import { getSellerContext } from "@/lib/listings/seller";
import { createClient } from "@/lib/supabase/server";

export type BundleState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

async function seller() {
  const viewer = await requireArea("seller", "/seller/bundles");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  return ctx;
}

const id = z.uuid();

/** Pesos as typed ("249" or "249.50") to centavos. */
const peso = z
  .string()
  .trim()
  .regex(/^\d{1,5}(\.\d{1,2})?$/, "Enter a price in pesos, like 249.")
  .transform((v) => Math.round(Number(v) * 100))
  .refine((c) => c >= 3000, "Bundles start at ₱30.")
  .refine((c) => c <= 1000000, "Keep the price at ₱10,000 or less.");

const bundleSchema = z.object({
  title: z.string().trim().min(4, "Use at least 4 characters.").max(160, "Keep the title under 160 characters."),
  topic: z.string().trim().max(200, "Keep the topic under 200 characters.").transform((v) => v || null),
  description: z.string().trim().max(4000, "Keep the description under 4,000 characters.").transform((v) => v || null),
  price: peso,
  items: z.array(id).max(12, "A bundle can have up to 12 resources."),
});

function fromForm(form: FormData) {
  return bundleSchema.safeParse({
    title: form.get("title") ?? "",
    topic: form.get("topic") ?? "",
    description: form.get("description") ?? "",
    price: form.get("price") ?? "",
    items: form.getAll("items").map(String),
  });
}

export async function createBundle(_prev: BundleState, form: FormData): Promise<BundleState> {
  const ctx = await seller();
  const title = z.string().trim().min(4, "Use at least 4 characters.").max(160).safeParse(form.get("title") ?? "");
  if (!title.success) return { fieldErrors: { title: title.error.issues.map((i) => i.message) } };
  const supabase = await createClient();
  const slug = `${slugify(title.data, 100) || "bundle"}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase
    .from("bundles")
    .insert({ storefront_id: ctx.storefront.id, slug, title: title.data, price_centavos: 3000, status: "draft" })
    .select("id")
    .single();
  if (error) return { error: "We couldn't create the bundle. Please try again." };
  redirect(`/seller/bundles/${data.id}`);
}

/** Saves a draft bundle: details, price and which resources are in it. */
export async function saveBundle(bundleId: string, _prev: BundleState, form: FormData): Promise<BundleState> {
  const ctx = await seller();
  if (!id.safeParse(bundleId).success) return { error: "Unknown bundle." };
  const parsed = fromForm(form);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { data: bundle } = await supabase.from("bundles").select("status").eq("id", bundleId).eq("storefront_id", ctx.storefront.id).maybeSingle();
  if (!bundle) return { error: "Unknown bundle." };
  if (bundle.status !== "draft") return { error: "Unpublish the bundle before changing it." };

  const { title, topic, description, price, items } = parsed.data;
  const { error } = await supabase.from("bundles").update({ title, topic, description, price_centavos: price }).eq("id", bundleId);
  if (error) return { error: "We couldn't save the bundle. Please try again." };
  const del = await supabase.from("bundle_items").delete().eq("bundle_id", bundleId);
  const ins = items.length
    ? await supabase.from("bundle_items").insert(items.map((p, i) => ({ bundle_id: bundleId, product_id: p, sort_order: i })))
    : { error: null };
  if (del.error || ins.error) {
    return { error: ins.error?.code === "42501" ? "Only your own live, paid resources can go in a bundle." : "Saved, but the resources didn't update. Please try again." };
  }
  revalidatePath(`/seller/bundles/${bundleId}`);
  revalidatePath("/seller/bundles");
  return { ok: true };
}

/** Publish or unpublish. The database checks there are 2+ live paid resources and the price is below their total. */
export async function setBundleStatus(bundleId: string, status: "draft" | "published"): Promise<BundleState> {
  const ctx = await seller();
  if (!id.safeParse(bundleId).success || !["draft", "published"].includes(status)) return { error: "Unknown bundle." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bundles")
    .update({ status })
    .eq("id", bundleId)
    .eq("storefront_id", ctx.storefront.id)
    .select("slug")
    .maybeSingle();
  if (error) return { error: error.code === "23514" || error.code === "42501" ? error.message.replace(/\.?$/, ".") : "We couldn't update the bundle. Please try again." };
  if (!data) return { error: "Unknown bundle." };
  revalidatePath(`/seller/bundles/${bundleId}`);
  revalidatePath("/seller/bundles");
  revalidatePath(`/bundles/${data.slug}`);
  return { ok: true };
}

export async function deleteBundle(bundleId: string): Promise<BundleState> {
  const ctx = await seller();
  if (!id.safeParse(bundleId).success) return { error: "Unknown bundle." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("bundles").delete().eq("id", bundleId).eq("storefront_id", ctx.storefront.id).select("id").maybeSingle();
  if (error || !data) return { error: "Only draft bundles can be deleted. Unpublish it first." };
  revalidatePath("/seller/bundles");
  redirect("/seller/bundles");
}
