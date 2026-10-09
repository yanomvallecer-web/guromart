import { publicEnv } from "@/lib/env";

/** Public URL for an object in a public bucket (previews, shop logos). Private buckets never use this. */
export function publicObjectUrl(bucket: "product-previews" | "storefront-media", path: string): string {
  const base = publicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
