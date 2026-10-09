import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type QueueItem = {
  id: string;
  title: string;
  price_centavos: number;
  updated_at: string;
  shop: string;
  file_count: number;
  unchecked: number;
};

/** Listings waiting for review, oldest first. Read through RLS as staff. */
export async function getReviewQueue(): Promise<QueueItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, title, price_centavos, updated_at, storefronts(name), product_files(scan_status)")
    .eq("status", "pending_review")
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not load the review queue: ${error.message}`);
  return (data as unknown as {
    id: string;
    title: string;
    price_centavos: number;
    updated_at: string;
    storefronts: { name: string } | null;
    product_files: { scan_status: string }[];
  }[]).map((r) => ({
    id: r.id,
    title: r.title,
    price_centavos: r.price_centavos,
    updated_at: r.updated_at,
    shop: r.storefronts?.name ?? "Unknown shop",
    file_count: r.product_files.length,
    unchecked: r.product_files.filter((f) => f.scan_status !== "clean").length,
  }));
}

export type ReviewListing = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string;
  status: string;
  price_centavos: number;
  license_type: string;
  license_terms: string | null;
  topic: string | null;
  learning_competency: string | null;
  copyright_declared_at: string | null;
  updated_at: string;
  rejection_reason: string | null;
  category: string | null;
  subject: string | null;
  grades: string[];
  shop: { name: string; slug: string; is_published: boolean; seller_status: string; seller_type: string; strikes: number };
  files: { id: string; original_filename: string; file_format: string; size_bytes: number; scan_status: string }[];
  previews: { id: string; storage_path: string }[];
};

export async function getListingForReview(id: string): Promise<ReviewListing> {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, slug, title, summary, description, status, price_centavos, license_type, license_terms, topic, learning_competency,
       copyright_declared_at, updated_at, rejection_reason,
       product_categories(name), subjects(name), product_grade_levels(grade_levels(name, sort_order)),
       storefronts(name, slug, is_published, seller_accounts(status, seller_type, copyright_strikes)),
       product_files(id, original_filename, file_format, size_bytes, scan_status, created_at),
       product_previews(id, storage_path, sort_order, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load listing: ${error.message}`);
  if (!data) notFound();
  const row = data as unknown as Omit<ReviewListing, "category" | "subject" | "grades" | "shop" | "files" | "previews"> & {
    product_categories: { name: string } | null;
    subjects: { name: string } | null;
    product_grade_levels: { grade_levels: { name: string; sort_order: number } | null }[];
    storefronts: {
      name: string;
      slug: string;
      is_published: boolean;
      seller_accounts: { status: string; seller_type: string; copyright_strikes: number } | null;
    } | null;
    product_files: (ReviewListing["files"][number] & { created_at: string })[];
    product_previews: (ReviewListing["previews"][number] & { created_at: string })[];
  };
  const byDate = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);
  return {
    ...row,
    category: row.product_categories?.name ?? null,
    subject: row.subjects?.name ?? null,
    grades: row.product_grade_levels
      .map((g) => g.grade_levels)
      .filter((g): g is { name: string; sort_order: number } => Boolean(g))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => g.name),
    shop: {
      name: row.storefronts?.name ?? "Unknown shop",
      slug: row.storefronts?.slug ?? "",
      is_published: row.storefronts?.is_published ?? false,
      seller_status: row.storefronts?.seller_accounts?.status ?? "unknown",
      seller_type: row.storefronts?.seller_accounts?.seller_type ?? "unknown",
      strikes: row.storefronts?.seller_accounts?.copyright_strikes ?? 0,
    },
    files: [...row.product_files].sort(byDate),
    previews: [...row.product_previews].sort(byDate),
  };
}
