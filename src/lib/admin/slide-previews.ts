import "server-only";
import { MAX_PREVIEWS } from "@/lib/listings/uploads";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeckListing = {
  productId: string;
  title: string;
  slug: string;
  status: string;
  previews: number;
  deck: { id: string; name: string };
};

/** Listings with a PowerPoint and free preview places: the ones slide previews can fill. */
export async function listingsNeedingSlides(): Promise<DeckListing[]> {
  const { data, error } = await createAdminClient()
    .from("products")
    .select("id, title, slug, status, product_files(id, original_filename, file_format, sort_order, created_at), product_previews(id)")
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Couldn't list listings: ${error.message}`);
  type Row = {
    id: string;
    title: string;
    slug: string;
    status: string;
    product_files: { id: string; original_filename: string; file_format: string; sort_order: number; created_at: string }[];
    product_previews: { id: string }[];
  };
  return ((data ?? []) as Row[]).flatMap((p) => {
    const deck = [...p.product_files]
      .filter((f) => f.file_format === "pptx")
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))[0];
    if (!deck || p.product_previews.length >= MAX_PREVIEWS) return [];
    return [{ productId: p.id, title: p.title, slug: p.slug, status: p.status, previews: p.product_previews.length, deck: { id: deck.id, name: deck.original_filename } }];
  });
}
