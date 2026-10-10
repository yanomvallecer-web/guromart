import { z } from "zod";

export const SORTS = ["relevance", "newest", "popular", "price_asc", "price_desc", "rating"] as const;
export const PRICE_BANDS = ["free", "under-100", "100-200", "over-200"] as const;
export const PAGE_SIZE = 24;

const code = z
  .string()
  .regex(/^[a-z0-9-]{1,60}$/)
  .optional()
  .catch(undefined);

/** Browse filters live in the URL so searches can be shared. Bad values are dropped, never trusted. */
export const browseParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  category: code,
  grade: code,
  subject: code,
  curriculum: code,
  period: code,
  shop: code,
  language: z.string().regex(/^[a-z_]{1,20}$/).optional().catch(undefined),
  format: z.enum(["pdf", "docx", "pptx", "xlsx", "zip", "png", "jpg", "webp"]).optional().catch(undefined),
  price: z.enum(PRICE_BANDS).optional().catch(undefined),
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
  /** "1" turns off the teaching-preference defaults for this search. */
  all: z.literal("1").optional().catch(undefined),
});

export type BrowseParams = Partial<z.infer<typeof browseParamsSchema>>;

export function parseBrowseParams(raw: Record<string, string | string[] | undefined>): BrowseParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return browseParamsSchema.parse(flat);
}

/** Price band in centavos: [min, max] inclusive, max null = no upper bound. */
export function priceRange(band: BrowseParams["price"]): [number, number | null] | null {
  switch (band) {
    case "free":
      return [0, 0];
    case "under-100":
      return [1, 9999];
    case "100-200":
      return [10000, 20000];
    case "over-200":
      return [20001, null];
    default:
      return null;
  }
}

export function effectiveSort(params: BrowseParams): Exclude<BrowseParams["sort"], undefined> {
  if (params.sort) return params.sort === "relevance" && !params.q ? "newest" : params.sort;
  return params.q ? "relevance" : "newest";
}

/** Builds a browse URL, keeping current filters and applying changes (null removes a key, page resets). */
export function browseHref(current: BrowseParams, changes: Partial<Record<keyof BrowseParams, string | number | null>>): string {
  const next = new URLSearchParams();
  const merged: Record<string, unknown> = { ...current, page: undefined, ...changes };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "") next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `/browse?${qs}` : "/browse";
}

/** URL keys that narrow the results (search words, sort and page are not filters). */
export const FILTER_KEYS = ["category", "grade", "subject", "price", "curriculum", "period", "language", "format", "shop"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** The filters in use, in display order. */
export function activeFilters(params: BrowseParams): { key: FilterKey; value: string }[] {
  return FILTER_KEYS.flatMap((key) => (params[key] ? [{ key, value: String(params[key]) }] : []));
}
