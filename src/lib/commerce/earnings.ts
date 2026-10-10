import "server-only";
import { createClient } from "@/lib/supabase/server";

export type EarningsSale = {
  id: number;
  createdAt: string;
  availableAt: string;
  onHold: boolean;
  title: string;
  priceCentavos: number;
  commissionBps: number;
  platformFeeCentavos: number;
  earningsCentavos: number;
};

export type Earnings = {
  /** Still inside the hold period. */
  pendingCentavos: number;
  availableCentavos: number;
  lifetimeCentavos: number;
  salesCount: number;
  releases: { date: string; amountCentavos: number; sales: number }[];
  recentSales: EarningsSale[];
};

/**
 * One seller's earnings, read from the append-only ledger as the signed-in
 * seller (RLS returns only their own entries). Balances come from the
 * seller_balances view, held amounts by release day from seller_upcoming_releases.
 */
export async function getEarnings(sellerAccountId: string): Promise<Earnings> {
  const supabase = await createClient();
  const [balance, releases, sales] = await Promise.all([
    supabase
      .from("seller_balances")
      .select("balance_centavos, available_centavos, lifetime_earnings_centavos")
      .eq("seller_account_id", sellerAccountId)
      .maybeSingle(),
    supabase
      .from("seller_upcoming_releases")
      .select("release_date, amount_centavos, sales")
      .eq("seller_account_id", sellerAccountId)
      .order("release_date"),
    supabase
      .from("seller_ledger_entries")
      .select(
        `id, created_at, available_at,
         order_items(title_snapshot, unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos)`,
        { count: "exact" },
      )
      .eq("seller_account_id", sellerAccountId)
      .eq("entry_type", "sale")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const failed = balance.error ?? releases.error ?? sales.error;
  if (failed) throw new Error(`Could not load your earnings: ${failed.message}`);

  // bigint sums arrive as numbers or strings depending on size.
  const n = (v: unknown) => Number(v ?? 0);
  const now = Date.now();
  type SaleRow = {
    id: number;
    created_at: string;
    available_at: string;
    order_items: {
      title_snapshot: string;
      unit_price_centavos: number;
      commission_bps: number;
      platform_fee_centavos: number;
      seller_earnings_centavos: number;
    };
  };
  return {
    pendingCentavos: n(balance.data?.balance_centavos) - n(balance.data?.available_centavos),
    availableCentavos: n(balance.data?.available_centavos),
    lifetimeCentavos: n(balance.data?.lifetime_earnings_centavos),
    salesCount: sales.count ?? 0,
    releases: (releases.data ?? []).map((r) => ({ date: r.release_date as string, amountCentavos: n(r.amount_centavos), sales: n(r.sales) })),
    recentSales: ((sales.data ?? []) as unknown as SaleRow[]).map((s) => ({
      id: s.id,
      createdAt: s.created_at,
      availableAt: s.available_at,
      onHold: new Date(s.available_at).getTime() > now,
      title: s.order_items.title_snapshot,
      priceCentavos: s.order_items.unit_price_centavos,
      commissionBps: s.order_items.commission_bps,
      platformFeeCentavos: s.order_items.platform_fee_centavos,
      earningsCentavos: s.order_items.seller_earnings_centavos,
    })),
  };
}
