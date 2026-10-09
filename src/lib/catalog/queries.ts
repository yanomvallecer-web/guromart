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

/** Server-side filtered, sorted and paginated catalog query on indexed columns. */
export async function browseProducts(params: BrowseParams): Promise<BrowseResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const taxonomy = await getTaxonomy();
  const idFor = (list: TaxonomyItem[], c?: string) => (c ? (list.find((i) => i.code === c)?.id ?? -1) : undefined);

  const gradeId = idFor(taxonomy.grades, params.grade);
  let select = gradeId !== undefined ? `${CARD_SELECT}, product_grade_levels!inner(grade_level_id)` : CARD_SELECT;
  if (params.shop) select = select.replace("storefronts(slug, name)", "storefronts!inner(slug, name)");
  let query = createPublicClient().from("products").select(select, { count: "exact" }).eq("status", "published");

  if (params.q) query = query.textSearch("search_vector", params.q, { type: "websearch", config: "simple" });
  const categoryId = idFor(taxonomy.categories, params.category);
  if (categoryId !== undefined) query = query.eq("category_id", categoryId);
  const subjectId = idFor(taxonomy.subjects, params.subject);
  if (subjectId !== undefined) query = query.eq("subject_id", subjectId);
  const curriculumId = idFor(taxonomy.curricula, params.curriculum);
  if (curriculumId !== undefined) query = query.eq("curriculum_id", curriculumId);
  const periodId = idFor(taxonomy.periods, params.period);
  if (periodId !== undefined) query = query.eq("academic_period_id", periodId);
  if (gradeId !== undefined) query = query.eq("product_grade_levels.grade_level_id", gradeId);
  if (params.shop) query = query.eq("storefronts.slug", params.shop);
  if (params.language) query = query.eq("language_code", params.language);
  if (params.format) query = query.contains("file_formats", [params.format]);
  const range = priceRange(params.price);
  if (range) {
    query = query.gte("price_centavos", range[0]);
    if (range[1] !== null) query = query.lte("price_centavos", range[1]);
  }

  switch (effectiveSort(params)) {
    case "price_asc":
      query = query.order("price_centavos", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price_centavos", { ascending: false });
      break;
    case "popular":
      query = query.order("sales_count", { ascending: false }).order("download_count", { ascending: false });
      break;
    case "rating":
      query = query.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false });
      break;
    default:
      // Full-text rank ordering needs an RPC; until then relevance falls back to newest among matches.
      query = query.order("published_at", { ascending: false });
  }

  const page = params.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Search failed: ${error.message}`);
  const total = count ?? 0;
  return {
    items: (data as unknown as CardRow[]).map(toCard),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
