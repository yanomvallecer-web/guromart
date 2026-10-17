import "server-only";
import { cache } from "react";
import type { Viewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type CartLine = {
  productId: string;
  addedAt: string;
  /** Null when the resource has since been unpublished; it can't be bought. */
  product: {
    slug: string;
    title: string;
    priceCentavos: number;
    shop: { name: string; slug: string } | null;
    previewPath: string | null;
  } | null;
};

export type Cart = { lines: CartLine[]; totalCentavos: number; buyableCount: number };

type Row = {
  product_id: string;
  added_at: string;
  products: {
    slug: string;
    title: string;
    price_centavos: number;
    status: string;
    storefronts: { name: string; slug: string } | null;
    product_previews: { storage_path: string; sort_order: number }[];
  } | null;
};

/** The viewer's cart with current prices. Prices are never taken from the browser. */
export async function getCart(viewer: Viewer): Promise<Cart> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      `product_id, added_at, carts!inner(user_id),
       products(slug, title, price_centavos, status, storefronts(name, slug), product_previews(storage_path, sort_order))`,
    )
    .eq("carts.user_id", viewer.id)
    .order("added_at", { ascending: true });
  if (error) throw new Error(`Could not load your cart: ${error.message}`);

  const lines = (data as unknown as Row[]).map((r): CartLine => {
    const p = r.products && r.products.status === "published" ? r.products : null;
    return {
      productId: r.product_id,
      addedAt: r.added_at,
      product: p
        ? {
            slug: p.slug,
            title: p.title,
            priceCentavos: p.price_centavos,
            shop: p.storefronts,
            previewPath: [...p.product_previews].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path ?? null,
          }
        : null,
    };
  });
  const buyable = lines.filter((l) => l.product);
  return {
    lines,
    totalCentavos: buyable.reduce((sum, l) => sum + (l.product?.priceCentavos ?? 0), 0),
    buyableCount: buyable.length,
  };
}

/** Number of resources in the viewer's cart, for the header and tab bar (one query per request). */
export const getCartCount = cache(async (viewer: Viewer): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("cart_items")
    .select("product_id, carts!inner(user_id)", { count: "exact", head: true })
    .eq("carts.user_id", viewer.id);
  return count ?? 0;
});

export type ProductAccess = "owner" | "owned" | "in_cart" | "none";

/** What the viewer can do with a product: their own, already owned, in cart, or nothing yet. */
export async function getProductAccess(viewer: Viewer, productId: string): Promise<ProductAccess> {
  const supabase = await createClient();
  const [owned, inCart, own] = await Promise.all([
    supabase.from("entitlements").select("id").eq("user_id", viewer.id).eq("product_id", productId).is("revoked_at", null).maybeSingle(),
    supabase.from("cart_items").select("product_id, carts!inner(user_id)").eq("carts.user_id", viewer.id).eq("product_id", productId).maybeSingle(),
    // Seller accounts are only readable by their owner, so this matches only their own products.
    supabase.from("products").select("id, storefronts!inner(seller_accounts!inner(user_id))").eq("id", productId).eq("storefronts.seller_accounts.user_id", viewer.id).maybeSingle(),
  ]);
  if (own.data) return "owner";
  if (owned.data) return "owned";
  if (inCart.data) return "in_cart";
  return "none";
}

export type LibraryItem = {
  entitlement_id: string;
  product_id: string;
  slug: string;
  title: string;
  is_live: boolean;
  shop_name: string;
  shop_slug: string;
  source: "purchase" | "free" | "grant";
  granted_at: string;
  files: { id: string; name: string; format: string; size: number; available: boolean }[];
};

/** Everything the viewer owns, newest first. */
export async function getLibrary(): Promise<LibraryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_library");
  if (error) throw new Error(`Could not load your library: ${error.message}`);
  return data as LibraryItem[];
}

export type LibraryDetails = {
  grades: { code: string; name: string; sort: number }[];
  period: { code: string; name: string; sort: number } | null;
  previewPath: string | null;
};

type DetailRow = {
  id: string;
  academic_periods: { code: string; name: string; sort_order: number } | null;
  product_grade_levels: { grade_levels: { code: string; name: string; sort_order: number } | null }[];
  product_previews: { storage_path: string; sort_order: number }[];
};

/**
 * Grade, quarter and first preview for library items, for filtering and
 * thumbnails. Read under row-level security, so only live listings have
 * details; resources no longer sold are listed without them.
 */
export async function getLibraryDetails(productIds: string[]): Promise<Map<string, LibraryDetails>> {
  if (productIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, academic_periods(code, name, sort_order),
       product_grade_levels(grade_levels(code, name, sort_order)),
       product_previews(storage_path, sort_order)`,
    )
    .in("id", productIds);
  if (error) throw new Error(`Could not load your library: ${error.message}`);
  return new Map(
    (data as unknown as DetailRow[]).map((r) => [
      r.id,
      {
        grades: r.product_grade_levels
          .map((g) => g.grade_levels)
          .filter((g): g is NonNullable<typeof g> => Boolean(g))
          .map((g) => ({ code: g.code, name: g.name, sort: g.sort_order }))
          .sort((a, b) => a.sort - b.sort),
        period: r.academic_periods ? { code: r.academic_periods.code, name: r.academic_periods.name, sort: r.academic_periods.sort_order } : null,
        previewPath: [...r.product_previews].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path ?? null,
      },
    ]),
  );
}
