import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type SellerPlans = { starterBps: number; proBps: number; minPayoutCentavos: number; holdDays: number };

/** Commission and payout rules from platform_settings (editable by admins). */
export async function getSellerPlans(): Promise<SellerPlans> {
  "use cache";
  cacheLife("hours");
  cacheTag("platform-settings");
  const { data, error } = await createPublicClient()
    .from("platform_settings")
    .select("key, value")
    .in("key", ["commission.starter_bps", "commission.pro_bps", "payouts.minimum_centavos", "payouts.hold_days"]);
  if (error) throw new Error(`Could not load platform settings: ${error.message}`);
  const get = (k: string) => {
    const v = Number(data.find((r) => r.key === k)?.value);
    if (!Number.isFinite(v)) throw new Error(`Platform setting ${k} is missing.`);
    return v;
  };
  return {
    starterBps: get("commission.starter_bps"),
    proBps: get("commission.pro_bps"),
    minPayoutCentavos: get("payouts.minimum_centavos"),
    holdDays: get("payouts.hold_days"),
  };
}
