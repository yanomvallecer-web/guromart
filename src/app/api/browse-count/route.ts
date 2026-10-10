import type { NextRequest } from "next/server";
import { countProducts } from "@/lib/catalog/queries";
import { parseBrowseParams } from "@/lib/catalog/search-params";

/**
 * Number of live resources matching browse filters, for the filter sheet's
 * "Show N resources" button. Same validation and database search as /browse.
 */
export async function GET(request: NextRequest) {
  const params = parseBrowseParams(Object.fromEntries(request.nextUrl.searchParams));
  // Page and sort don't change the count; dropping them shares cache entries.
  const total = await countProducts({ ...params, page: undefined, sort: undefined });
  return Response.json({ total }, { headers: { "Cache-Control": "private, max-age=30" } });
}
