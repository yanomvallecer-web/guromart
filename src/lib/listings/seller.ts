import "server-only";
import { notFound } from "next/navigation";
import type { Viewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type SellerContext = {
  sellerAccountId: string;
  status: string;
  storefront: { id: string; slug: string; name: string };
};

/** The signed-in seller's account and storefront, read through RLS. */
export async function getSellerContext(viewer: Viewer): Promise<SellerContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seller_accounts")
    .select("id, status, storefronts(id, slug, name)")
    .eq("user_id", viewer.id)
    .maybeSingle();
  const store = data?.storefronts as unknown as SellerContext["storefront"] | null;
  if (!data || !store) return null;
  return { sellerAccountId: data.id, status: data.status, storefront: store };
}

export type EditableListing = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string;
  status: string;
  rejection_reason: string | null;
  category_id: number;
  subject_id: number | null;
  curriculum_id: number | null;
  academic_period_id: number | null;
  period_detail: string | null;
  topic: string | null;
  learning_competency: string | null;
  language_code: string | null;
  price_centavos: number;
  page_count: number | null;
  is_editable: boolean;
  license_type: string;
  license_terms: string | null;
  copyright_declared_at: string | null;
  updated_at: string;
  grade_ids: number[];
  files: { id: string; original_filename: string; file_format: string; size_bytes: number; scan_status: string }[];
  previews: { id: string; storage_path: string; alt_text: string | null }[];
};

/** One of the seller's own listings, or 404. RLS guarantees ownership. */
export async function getOwnListing(storefrontId: string, id: string): Promise<EditableListing> {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, slug, title, summary, description, status, rejection_reason, category_id, subject_id, curriculum_id,
       academic_period_id, period_detail, topic, learning_competency, language_code, price_centavos, page_count,
       is_editable, license_type, license_terms, copyright_declared_at, updated_at,
       product_grade_levels(grade_level_id),
       product_files(id, original_filename, file_format, size_bytes, scan_status, sort_order, created_at),
       product_previews(id, storage_path, alt_text, sort_order, created_at)`,
    )
    .eq("id", id)
    .eq("storefront_id", storefrontId)
    .maybeSingle();
  if (error) throw new Error(`Could not load listing: ${error.message}`);
  if (!data) notFound();
  const row = data as unknown as Omit<EditableListing, "grade_ids" | "files" | "previews"> & {
    product_grade_levels: { grade_level_id: number }[];
    product_files: (EditableListing["files"][number] & { created_at: string })[];
    product_previews: (EditableListing["previews"][number] & { created_at: string })[];
  };
  const byDate = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);
  return {
    ...row,
    grade_ids: row.product_grade_levels.map((g) => g.grade_level_id),
    files: [...row.product_files].sort(byDate),
    previews: [...row.product_previews].sort(byDate),
  };
}

export type ListingSummary = { id: string; title: string; status: string; price_centavos: number; updated_at: string; slug: string };

export async function listOwnListings(storefrontId: string): Promise<ListingSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, title, status, price_centavos, updated_at")
    .eq("storefront_id", storefrontId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load your resources: ${error.message}`);
  return data;
}
