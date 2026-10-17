import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string;
  price_centavos: number;
  topic: string | null;
  learning_competency: string | null;
  period_detail: string | null;
  page_count: number | null;
  is_editable: boolean;
  license_type: "single_teacher" | "multiple_teachers" | "school_site";
  license_terms: string | null;
  file_formats: string[];
  rating_avg: number;
  rating_count: number;
  download_count: number;
  published_at: string | null;
  updated_at: string;
  category: string | null;
  subject: string | null;
  curriculum: string | null;
  period: string | null;
  language: string | null;
  grades: string[];
  storefront: { id: string; slug: string; name: string } | null;
  previews: { storage_path: string; alt_text: string | null }[];
};

/** A published product by slug, or null. RLS hides anything not live. */
export async function getPublishedProduct(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", `product:${slug}`);
  const { data, error } = await createPublicClient()
    .from("products")
    .select(
      `id, slug, title, summary, description, price_centavos, topic, learning_competency, period_detail,
       page_count, is_editable, license_type, license_terms, file_formats, rating_avg, rating_count, download_count, published_at, updated_at,
       product_categories(name), subjects(name), curricula(name), academic_periods(name), languages(name),
       product_grade_levels(grade_levels(name, sort_order)),
       storefronts(id, slug, name),
       product_previews(storage_path, alt_text, sort_order)`,
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`Could not load resource: ${error.message}`);
  if (!data) return null;
  // Supabase returns embedded rows loosely typed without generated types.
  const row = data as unknown as Record<string, unknown> & {
    product_grade_levels: { grade_levels: { name: string; sort_order: number } | null }[];
    product_previews: { storage_path: string; alt_text: string | null; sort_order: number }[];
  };
  const name = (k: string) => ((row[k] as { name: string } | null)?.name ?? null);
  return {
    ...(row as unknown as ProductDetail),
    rating_avg: Number(row.rating_avg),
    category: name("product_categories"),
    subject: name("subjects"),
    curriculum: name("curricula"),
    period: name("academic_periods"),
    language: name("languages"),
    grades: row.product_grade_levels
      .map((g) => g.grade_levels)
      .filter((g): g is { name: string; sort_order: number } => Boolean(g))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => g.name),
    storefront: row.storefronts as ProductDetail["storefront"],
    previews: [...row.product_previews].sort((a, b) => a.sort_order - b.sort_order),
  };
}
