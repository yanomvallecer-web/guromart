import "server-only";
import { createClient } from "@/lib/supabase/server";

export type OrderSummary = {
  id: string;
  order_number: string;
  status: "pending_payment" | "paid" | "failed" | "cancelled" | "expired" | "refunded" | "partially_refunded";
  total_centavos: number;
  created_at: string;
  paid_at: string | null;
};

export type OrderDetail = OrderSummary & {
  items: { id: string; title_snapshot: string; unit_price_centavos: number; product_id: string }[];
  payment: { payment_method: string | null; status: string } | null;
};

/** The signed-in buyer's orders, newest first (RLS limits rows to their own). */
export async function listOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total_centavos, created_at, paid_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load your orders: ${error.message}`);
  return data as OrderSummary[];
}

/** One of the buyer's orders by number, or null. */
export async function getOrder(orderNumber: string): Promise<OrderDetail | null> {
  if (!/^GM-\d{1,12}$/.test(orderNumber)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, total_centavos, created_at, paid_at,
       order_items(id, title_snapshot, unit_price_centavos, product_id),
       payments(payment_method, status, created_at)`,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error(`Could not load the order: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as OrderSummary & {
    order_items: OrderDetail["items"];
    payments: { payment_method: string | null; status: string; created_at: string }[];
  };
  const payment = [...row.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  return { ...row, items: row.order_items, payment };
}

export const ORDER_STATUS: Record<OrderSummary["status"], { label: string; tone: "success" | "warning" | "muted" }> = {
  pending_payment: { label: "Waiting for payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Payment failed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  refunded: { label: "Refunded", tone: "muted" },
  partially_refunded: { label: "Partly refunded", tone: "muted" },
};
