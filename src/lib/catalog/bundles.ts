import "server-only";
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

/** A shop's live bundles. */
export async function shopBundles(storefrontId: string): Promise<BundleSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("bundles").select(SUMMARY).eq("storefront_id", storefrontId).eq("status", "published").order("created_at", { ascending: false });
  return (data ?? []) as BundleSummary[];
}
