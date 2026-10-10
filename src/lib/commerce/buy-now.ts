import "server-only";
import { cacheLife } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/** PostgREST's answer when a database function doesn't exist (its migration hasn't been run yet). */
export function isMissingFunction(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

/**
 * Whether the database has Buy now's function, create_order_for_product().
 * It comes with a migration that may be run after this code deploys; until
 * then Buy now stays hidden and the rest of the page works as before.
 * Asked as a visitor, who may not run it, so the check creates nothing:
 * "permission denied" means the function exists.
 */
export async function buyNowReady(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  const { error } = await createPublicClient().rpc("create_order_for_product", { p_product_id: null });
  if (error && isMissingFunction(error)) {
    console.error("Buy now is hidden: create_order_for_product() is missing. Run guromart-setup/ux-buy-now.sql.");
    return false;
  }
  return true;
}
