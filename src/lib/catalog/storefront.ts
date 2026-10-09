import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type Storefront = { id: string; slug: string; name: string; tagline: string | null; description: string | null };

/** A live storefront by slug, or null. RLS hides unpublished shops and inactive sellers. */
export async function getStorefront(slug: string): Promise<Storefront | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("storefronts", `storefront:${slug}`);
  const { data, error } = await createPublicClient()
    .from("storefronts")
    .select("id, slug, name, tagline, description")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Could not load shop: ${error.message}`);
  return data;
}
