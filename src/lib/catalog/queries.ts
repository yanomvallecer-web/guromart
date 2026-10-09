import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { type BrowseParams, PAGE_SIZE, effectiveSort, priceRange } from "./search-params";

export type TaxonomyItem = { id: number; code: string; name: string };
export type Taxonomy = {
  grades: TaxonomyItem[];
  subjects: TaxonomyItem[];
  categories: TaxonomyItem[];
  curricula: TaxonomyItem[];
  periods: TaxonomyItem[];
  languages: { code: string; name: string }[];
};

export async function getTaxonomy(): Promise<Taxonomy> {
  "use cache";
  cacheLife("hours");
  cacheTag("taxonomy");
  const db = createPublicClient();
  const active = (table: string) =>
    db.from(table).select("id, code, name").eq("is_active", true).order("sort_order");
  const [grades, subjects, categories, curricula, periods, languages] = await Promise.all([
    active("grade_levels"),
    active("subjects"),
    active("product_categories"),
    active("curricula"),
    active("academic_periods"),
    db.from("languages").select("code, name").order("sort_order"),
  ]);
  for (const r of [grades, subjects, categories, curricula, periods, languages]) {
    if (r.error) throw new Error(`Could not load categories: ${r.error.message}`);
  }
  return {
    grades: grades.data!,
    subjects: subjects.data!,
    categories: categories.data!,
    curricula: curricula.data!,
    periods: periods.data!,
    languages: languages.data!,
  };
}

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  price_centavos: number;
  rating_avg: number;
  rating_count: number;
  category: string | null;
  subject: string | null;
  storefront: { slug: string; name: string } | null;
  preview_path: string | null;
};

const CARD_SELECT = `id, slug, title, price_centavos, rating_avg, rating_count,
  product_categories(name), subjects(name), storefronts(slug, name),
  product_previews(storage_path, sort_order)`;

type CardRow = {
  id: string;
  slug: string;
  title: string;
  price_centavos: number;
  rating_avg: number | string;
  rating_count: number;
  product_categories: { name: string } | null;
  subjects: { name: string } | null;
  storefronts: { slug: string; name: string } | null;
  product_previews: { storage_path: string; sort_order: number }[] | null;
};

function toCard(row: CardRow): ProductCard {
  const preview = [...(row.product_previews ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    price_centavos: row.price_centavos,
    rating_avg: Number(row.rating_avg),
    rating_count: row.rating_count,
    category: row.product_categories?.name ?? null,
    subject: row.subjects?.name ?? null,
    storefront: row.storefronts,
    preview_path: preview?.storage_path ?? null,
  };
}

export type HomeShelf = "featured" | "free" | "popular" | "new";

/** Real, published products for a homepage shelf. RLS limits results to live listings. */
export async function getShelf(shelf: HomeShelf, limit = 8): Promise<ProductCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  let query = createPublicClient().from("products").select(CARD_SELECT).eq("status", "published");
  if (shelf === "featured") query = query.eq("is_featured", true).order("published_at", { ascending: false });
  if (shelf === "free") query = query.eq("price_centavos", 0).order("download_count", { ascending: false });
  if (shelf === "popular") query = query.order("sales_count", { ascending: false }).order("download_count", { ascending: false });
  if (shelf === "new") query = query.order("published_at", { ascending: false });
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return (data as unknown as CardRow[]).map(toCard);
}

export type FeaturedStore = { slug: string; name: string; tagline: string | null };

export async function getFeaturedStorefronts(limit = 6): Promise<FeaturedStore[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("storefronts");
  const { data, error } = await createPublicClient()
    .from("storefronts")
    .select("slug, name, tagline")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load shops: ${error.message}`);
  return data;
}

export type BrowseResult = { items: ProductCard[]; total: number; page: number; pageCount: number };

/**
 * Server-side filtered, ranked and paginated catalog search. The database
 * function applies the filters, widens the query with Filipino/English
 * synonyms, tolerates title typos and orders by relevance; RLS limits it to
 * live listings. Cards for the page are then loaded in that order.
 */
export async function browseProducts(params: BrowseParams): Promise<BrowseResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const db = createPublicClient();
  const page = params.page ?? 1;
  const range = priceRange(params.price);
  const { data: hits, error } = await db.rpc("browse_product_ids", {
    p_q: params.q ?? null,
    p_category: params.category ?? null,
    p_grade: params.grade ?? null,
    p_subject: params.subject ?? null,
    p_curriculum: params.curriculum ?? null,
    p_period: params.period ?? null,
    p_shop: params.shop ?? null,
    p_language: params.language ?? null,
    p_format: params.format ?? null,
    p_price_min: range ? range[0] : null,
    p_price_max: range ? range[1] : null,
    p_sort: effectiveSort(params),
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  const rows = (hits ?? []) as { id: string; total: number }[];
  const total = rows.length ? Number(rows[0].total) : 0;

  let items: ProductCard[] = [];
  if (rows.length) {
    const { data, error: cardError } = await db.from("products").select(CARD_SELECT).in("id", rows.map((r) => r.id));
    if (cardError) throw new Error(`Search failed: ${cardError.message}`);
    const byId = new Map((data as unknown as CardRow[]).map((r) => [r.id, toCard(r)]));
    items = rows.map((r) => byId.get(r.id)).filter((c): c is ProductCard => Boolean(c));
  }
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
