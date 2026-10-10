import "server-only";
import { createClient } from "@/lib/supabase/server";

type OrderStatus = "pending_payment" | "paid" | "failed" | "cancelled" | "expired" | "refunded" | "partially_refunded";

export type OrderPayment = { payment_method: string | null; status: string; failure_reason: string | null; livemode: boolean };

export type OrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_centavos: number;
  created_at: string;
  paid_at: string | null;
  /** The latest checkout attempt, if one was opened. */
  payment: OrderPayment | null;
};

export type OrderDetail = OrderSummary & {
  items: { id: string; title_snapshot: string; unit_price_centavos: number; product_id: string }[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Marks the buyer's unpaid orders as expired once PayMongo's checkout page
 * has closed. Runs when they look at orders or start a checkout, so no
 * scheduled job is needed. Best effort: a failure here must not hide orders.
 */
export async function expireStaleOrders(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("expire_my_stale_orders");
  if (error) console.error("Could not expire stale orders", { error: error.message });
}

type PaymentRow = OrderPayment & { created_at: string };
const latest = (payments: PaymentRow[]): OrderPayment | null => {
  const p = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return p ? { payment_method: p.payment_method, status: p.status, failure_reason: p.failure_reason, livemode: p.livemode } : null;
};

/** The signed-in buyer's orders, newest first (RLS limits rows to their own). */
export async function listOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient();
  await expireStaleOrders(supabase);
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total_centavos, created_at, paid_at, payments(payment_method, status, failure_reason, livemode, created_at)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load your orders: ${error.message}`);
  return (data as unknown as (Omit<OrderSummary, "payment"> & { payments: PaymentRow[] })[]).map(({ payments, ...o }) => ({
    ...o,
    payment: latest(payments),
  }));
}

/** One of the buyer's orders by number, or null. */
export async function getOrder(orderNumber: string): Promise<OrderDetail | null> {
  if (!/^GM-\d{1,12}$/.test(orderNumber)) return null;
  const supabase = await createClient();
  await expireStaleOrders(supabase);
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, total_centavos, created_at, paid_at,
       order_items(id, title_snapshot, unit_price_centavos, product_id),
       payments(payment_method, status, failure_reason, livemode, created_at)`,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error(`Could not load the order: ${error.message}`);
  if (!data) return null;
  const { order_items, payments, ...row } = data as unknown as Omit<OrderSummary, "payment"> & {
    order_items: OrderDetail["items"];
    payments: PaymentRow[];
  };
  return { ...row, items: order_items, payment: latest(payments) };
}

/**
 * What to tell the buyer. An open order whose last attempt failed is shown as
 * failed, though it stays open: they may still pay on PayMongo's page.
 */
export function orderStatus(order: Pick<OrderSummary, "status" | "payment">) {
  if (order.status === "pending_payment" && order.payment?.status === "failed") return PAYMENT_FAILED;
  return ORDER_STATUS[order.status];
}

const PAYMENT_FAILED = { label: "Payment didn't go through", tone: "danger" } as const;

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "success" | "warning" | "muted" | "danger" }> = {
  pending_payment: { label: "Waiting for payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Payment failed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  refunded: { label: "Refunded", tone: "muted" },
  partially_refunded: { label: "Partly refunded", tone: "muted" },
};
