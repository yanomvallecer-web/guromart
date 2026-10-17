import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Orders that took money, even if some of it went back later. */
export const PAID_STATUSES = ["paid", "partially_refunded", "refunded"] as const;

const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
/** A date's day in Manila, as YYYY-MM-DD. */
export const manilaDay = (d: Date | string) => day.format(new Date(d));

export type SalesSummary = {
  today: number;
  thisMonth: number;
  allTime: number;
  refunded: number;
  platformFees: number;
  sellerEarnings: number;
  paidOrders: number;
  waiting: number;
  /** The last 30 days in Manila, oldest first, including days with no sales. */
  daily: { day: string; centavos: number; orders: number }[];
  complete: boolean;
};

const LIMIT = 20000;

/**
 * Sales totals from paid orders. Callers must have checked the viewer is an
 * admin: this reads every order with the service role.
 */
export async function getSalesSummary(): Promise<SalesSummary> {
  const admin = createAdminClient();
  const [orders, items, waiting] = await Promise.all([
    admin.from("orders").select("total_centavos, refunded_centavos, paid_at").in("status", [...PAID_STATUSES]).gt("total_centavos", 0).limit(LIMIT),
    admin
      .from("order_items")
      .select("platform_fee_centavos, seller_earnings_centavos, refunded_centavos, orders!inner(status, total_centavos)")
      .in("orders.status", [...PAID_STATUSES])
      .gt("orders.total_centavos", 0)
      .limit(LIMIT),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
  ]);
  for (const r of [orders, items, waiting]) if (r.error) throw new Error(`Could not load sales: ${r.error.message}`);

  const now = new Date();
  const today = manilaDay(now);
  const month = today.slice(0, 7);
  const days = Array.from({ length: 30 }, (_, i) => manilaDay(new Date(now.getTime() - (29 - i) * 86_400_000)));
  const byDay = new Map(days.map((d) => [d, { day: d, centavos: 0, orders: 0 }]));

  const summary: SalesSummary = {
    today: 0, thisMonth: 0, allTime: 0, refunded: 0, platformFees: 0, sellerEarnings: 0,
    paidOrders: orders.data?.length ?? 0, waiting: waiting.count ?? 0, daily: [],
    complete: (orders.data?.length ?? 0) < LIMIT && (items.data?.length ?? 0) < LIMIT,
  };
  for (const o of orders.data ?? []) {
    const net = o.total_centavos - o.refunded_centavos;
    summary.allTime += net;
    summary.refunded += o.refunded_centavos;
    if (!o.paid_at) continue;
    const d = manilaDay(o.paid_at);
    if (d === today) summary.today += net;
    if (d.startsWith(month)) summary.thisMonth += net;
    const bucket = byDay.get(d);
    if (bucket) {
      bucket.centavos += net;
      bucket.orders += 1;
    }
  }
  for (const i of items.data ?? []) {
    // A refunded item gives back the seller's share and GuroMart's fee in proportion.
    const price = i.platform_fee_centavos + i.seller_earnings_centavos;
    const kept = price ? (price - i.refunded_centavos) / price : 0;
    summary.platformFees += Math.round(i.platform_fee_centavos * kept);
    summary.sellerEarnings += Math.round(i.seller_earnings_centavos * kept);
  }
  summary.daily = [...byDay.values()];
  return summary;
}
