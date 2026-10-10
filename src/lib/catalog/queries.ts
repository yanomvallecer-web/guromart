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
  category_code: string | null;
  subject: string | null;
  storefront: { slug: string; name: string } | null;
  preview_path: string | null;
  topic: string | null;
  grades: string[];
  file_formats: string[];
  page_count: number | null;
  is_editable: boolean;
};

const CARD_SELECT = `id, slug, title, topic, price_centavos, rating_avg, rating_count, file_formats, page_count, is_editable,
  product_categories(code, name), subjects(name), storefronts(slug, name),
  product_grade_levels(grade_levels(name, sort_order)),
  product_previews(storage_path, sort_order)`;

type CardRow = {
  id: string;
  slug: string;
  title: string;
  price_centavos: number;
  rating_avg: number | string;
  rating_count: number;
  product_categories: { code: string; name: string } | null;
  subjects: { name: string } | null;
  storefronts: { slug: string; name: string } | null;
  product_previews: { storage_path: string; sort_order: number }[] | null;
  topic: string | null;
  file_formats: string[] | null;
  page_count: number | null;
  is_editable: boolean;
  product_grade_levels: { grade_levels: { name: string; sort_order: number } | null }[] | null;
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
    category_code: row.product_categories?.code ?? null,
    subject: row.subjects?.name ?? null,
    storefront: row.storefronts,
    preview_path: preview?.storage_path ?? null,
    topic: row.topic,
    grades: (row.product_grade_levels ?? [])
      .map((g) => g.grade_levels)
      .filter((g): g is { name: string; sort_order: number } => Boolean(g))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => g.name),
    file_formats: row.file_formats ?? [],
    page_count: row.page_count,
    is_editable: row.is_editable,
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
  if (shelf === "popular")
    query = query.order("sales_count", { ascending: false }).order("download_count", { ascending: false }).order("published_at", { ascending: false });
  if (shelf === "new") query = query.order("published_at", { ascending: false });
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return (data as unknown as CardRow[]).map(toCard);
}

export type FeaturedStore = { slug: string; name: string; tagline: string | null };

export type Facet = { code: string; name: string; count: number };
export type ShopFacet = { count: number; subjects: string[]; grades: string[] };
export type CatalogFacets = {
  total: number;
  free: number;
  grades: Facet[];
  subjects: Facet[];
  categories: Facet[];
  /** By storefront slug: how many live resources, and the subjects and grades they cover. */
  shops: Record<string, ShopFacet>;
};

type FacetRow = {
  price_centavos: number;
  subjects: { code: string; name: string } | null;
  product_categories: { code: string; name: string } | null;
  storefronts: { slug: string } | null;
  product_grade_levels: { grade_levels: { code: string; name: string; sort_order: number } | null }[] | null;
};

/**
 * Live resource counts by grade, subject, type and shop, counted from the
 * published listings themselves (RLS limits rows to live ones), so every
 * number shown is real. Lists keep the taxonomy's own order.
 */
export async function getCatalogFacets(): Promise<CatalogFacets> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const db = createPublicClient();
  const rows: FacetRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("products")
      .select("price_centavos, subjects(code, name), product_categories(code, name), storefronts(slug), product_grade_levels(grade_levels(code, name, sort_order))")
      .eq("status", "published")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not count resources: ${error.message}`);
    rows.push(...(data as unknown as FacetRow[]));
    if (data.length < PAGE) break;
  }
  const taxonomy = await getTaxonomy();
  const tally = (key: (r: FacetRow) => string[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const k of new Set(key(r))) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  };
  const gradeCodes = (r: FacetRow) => (r.product_grade_levels ?? []).flatMap((g) => (g.grade_levels ? [g.grade_levels.code] : []));
  const facets = (items: TaxonomyItem[], counts: Map<string, number>) =>
    items.map((i) => ({ code: i.code, name: i.name, count: counts.get(i.code) ?? 0 }));

  const gradeName = new Map(taxonomy.grades.map((g, i) => [g.code, { name: g.name, i }]));
  const shops = new Map<string, ShopFacet & { gradeCodes: Set<string>; subjectSet: Set<string> }>();
  for (const r of rows) {
    const slug = r.storefronts?.slug;
    if (!slug) continue;
    const shop = shops.get(slug) ?? { count: 0, subjects: [], grades: [], gradeCodes: new Set(), subjectSet: new Set() };
    shop.count += 1;
    if (r.subjects) shop.subjectSet.add(r.subjects.name);
    for (const g of gradeCodes(r)) shop.gradeCodes.add(g);
    shops.set(slug, shop);
  }
  return {
    total: rows.length,
    free: rows.filter((r) => r.price_centavos === 0).length,
    grades: facets(taxonomy.grades, tally(gradeCodes)),
    subjects: facets(taxonomy.subjects, tally((r) => (r.subjects ? [r.subjects.code] : []))),
    categories: facets(taxonomy.categories, tally((r) => (r.product_categories ? [r.product_categories.code] : []))),
    shops: Object.fromEntries(
      [...shops].map(([slug, s]) => [
        slug,
        {
          count: s.count,
          subjects: [...s.subjectSet].sort(),
          grades: [...s.gradeCodes]
            .filter((c) => gradeName.has(c))
            .sort((a, b) => gradeName.get(a)!.i - gradeName.get(b)!.i)
            .map((c) => gradeName.get(c)!.name),
        },
      ]),
    ),
  };
}

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
  const { data: hits, error } = await db.rpc("browse_product_ids", searchArgs(params, PAGE_SIZE, (page - 1) * PAGE_SIZE));
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

/**
 * How many live resources match the filters, from the same database search
 * as browseProducts (one row is enough: every row carries the full count).
 * Used by the phone filter sheet's "Show N resources" button.
 */
export async function countProducts(params: BrowseParams): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const { data, error } = await createPublicClient().rpc("browse_product_ids", searchArgs(params, 1, 0));
  if (error) throw new Error(`Search failed: ${error.message}`);
  const rows = (data ?? []) as { total: number }[];
  return rows.length ? Number(rows[0].total) : 0;
}

function searchArgs(params: BrowseParams, limit: number, offset: number) {
  const range = priceRange(params.price);
  return {
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
    p_limit: limit,
    p_offset: offset,
  };
}
