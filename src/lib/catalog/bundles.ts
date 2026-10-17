import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { type ProductCard, getCardsByIds } from "./queries";

export type BundleSummary = { id: string; slug: string; title: string; topic: string | null; price_centavos: number; status: string };
export type BundleDetail = BundleSummary & {
  description: string | null;
  storefront: { id: string; slug: string; name: string } | null;
  items: ProductCard[];
  /** What the resources cost bought one by one. */
  separate_centavos: number;
};

const SUMMARY = "id, slug, title, topic, price_centavos, status";

/**
 * A bundle by its address. Read under RLS, so visitors only see live bundles
 * while the shop's seller and staff can also open drafts and hidden ones.
 */
export async function getBundle(slug: string): Promise<BundleDetail | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bundles")
    .select(`${SUMMARY}, description, storefronts(id, slug, name), bundle_items(product_id, sort_order)`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Could not load bundle: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as BundleSummary & {
    description: string | null;
    storefronts: BundleDetail["storefront"];
    bundle_items: { product_id: string; sort_order: number }[];
  };
  const ids = [...row.bundle_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.product_id);
  const items = await getCardsByIds(ids);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    price_centavos: row.price_centavos,
    status: row.status,
    description: row.description,
    storefront: row.storefronts,
    items,
    separate_centavos: items.reduce((s, i) => s + i.price_centavos, 0),
  };
}

/** Live bundles that include a resource, for "Part of a bundle" on its page. */
export async function bundlesWithProduct(productId: string): Promise<BundleSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("bundle_items").select(`bundles!inner(${SUMMARY})`).eq("product_id", productId).eq("bundles.status", "published");
  return ((data ?? []) as unknown as { bundles: BundleSummary }[]).map((r) => r.bundles);
}

export type BundleCard = {
  id: string;
  slug: string;
  title: string;
  topic: string | null;
  price_centavos: number;
  storefront: { slug: string; name: string } | null;
  /** Live resources in the bundle. */
  item_count: number;
  /** What those resources cost bought one by one. */
  separate_centavos: number;
  /** The first preview image of up to four of its resources, in bundle order: the bundle's picture. */
  cover_paths: string[];
};

type BundleCardRow = {
  id: string;
  slug: string;
  title: string;
  topic: string | null;
  price_centavos: number;
  storefronts: { slug: string; name: string } | null;
  bundle_items: {
    sort_order: number;
    products: { price_centavos: number; product_previews: { storage_path: string; sort_order: number }[] } | null;
  }[];
};

const CARD_SELECT = `id, slug, title, topic, price_centavos, storefronts(slug, name),
       bundle_items(sort_order, products(price_centavos, product_previews(storage_path, sort_order)))`;

function toBundleCard(b: BundleCardRow): BundleCard {
  const items = [...b.bundle_items].sort((x, y) => x.sort_order - y.sort_order).flatMap((i) => (i.products ? [i.products] : []));
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    topic: b.topic,
    price_centavos: b.price_centavos,
    storefront: b.storefronts,
    item_count: items.length,
    separate_centavos: items.reduce((s, i) => s + i.price_centavos, 0),
    cover_paths: items
      .map((i) => [...i.product_previews].sort((x, y) => x.sort_order - y.sort_order)[0]?.storage_path)
      .filter((p): p is string => Boolean(p))
      .slice(0, 4),
  };
}

/**
 * Live bundles as cards, newest first, optionally one shop's only. Read
 * anonymously, so only live bundles and live resources count.
 */
export async function getLiveBundleCards({ limit = 4, storefrontId }: { limit?: number; storefrontId?: string } = {}): Promise<BundleCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "bundles");
  let query = createPublicClient().from("bundles").select(CARD_SELECT).eq("status", "published");
  if (storefrontId) query = query.eq("storefront_id", storefrontId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not load bundles: ${error.message}`);
  return (data as unknown as BundleCardRow[]).map(toBundleCard);
}

/**
 * Live bundles matching search words, by their own title, topic and
 * description or by a resource inside them; title matches first.
 */
export async function searchBundleCards(q: string, { shop, limit = 6 }: { shop?: string; limit?: number } = {}): Promise<BundleCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "bundles");
  const db = createPublicClient();
  const { data: ids, error } = await db.rpc("search_bundle_ids", { p_q: q, p_shop: shop ?? null, p_limit: limit });
  if (error) throw new Error(`Bundle search failed: ${error.message}`);
  const order = (ids ?? []) as string[];
  if (!order.length) return [];
  const { data, error: cardError } = await db.from("bundles").select(CARD_SELECT).in("id", order);
  if (cardError) throw new Error(`Bundle search failed: ${cardError.message}`);
  const byId = new Map((data as unknown as BundleCardRow[]).map((b) => [b.id, toBundleCard(b)]));
  return order.map((id) => byId.get(id)).filter((b): b is BundleCard => Boolean(b));
}
