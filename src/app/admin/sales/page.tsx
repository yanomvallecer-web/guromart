import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Clock, Coins, Landmark, ReceiptText, Store, Undo2, Wallet } from "lucide-react";
import { SalesChart } from "@/components/admin/sales-chart";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card, EmptyState } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { getSalesSummary } from "@/lib/admin/sales";
import { requireArea } from "@/lib/auth/dal";
import { formatAmount } from "@/lib/format";
import { METHOD_NAME } from "@/lib/payments/paymongo";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales", robots: { index: false } };

const PAGE_SIZE = 25;
const SHOWS = [
  { value: "paid", label: "Paid", statuses: ["paid", "partially_refunded", "refunded"] },
  { value: "waiting", label: "Waiting for payment", statuses: ["pending_payment"] },
  { value: "unpaid", label: "Not completed", statuses: ["failed", "cancelled", "expired"] },
  { value: "all", label: "All orders", statuses: null },
] as const;
type Show = (typeof SHOWS)[number]["value"];

const STATUS: Record<string, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "bg-success-soft text-success" },
  partially_refunded: { label: "Partly refunded", tone: "bg-accent-soft text-foreground" },
  refunded: { label: "Refunded", tone: "bg-accent-soft text-foreground" },
  pending_payment: { label: "Waiting", tone: "bg-primary-soft text-primary" },
  failed: { label: "Failed", tone: "bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", tone: "bg-surface-muted text-muted-foreground" },
  expired: { label: "Expired", tone: "bg-surface-muted text-muted-foreground" },
};

type SearchParams = Promise<{ show?: string; page?: string }>;

export default function SalesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell
      title="Sales"
      description="Every order and payment, with what GuroMart and sellers earned."
      actions={<Link href="/admin" className="text-sm font-semibold">Admin overview</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Summary />
      </Suspense>
      <Suspense fallback={<PanelSkeleton />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function Summary() {
  await requireArea("admin", "/admin/sales");
  const s = await getSalesSummary();
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="sales-summary">
        <StatTile label="Sales today" value={formatAmount(s.today)} icon={Coins} tone="green" valueTestId="sales-today" />
        <StatTile label="Sales this month" value={formatAmount(s.thisMonth)} icon={CalendarDays} tone="blue" />
        <StatTile label="All-time sales" value={formatAmount(s.allTime)} icon={ReceiptText} tone="yellow" note={`${s.paidOrders} paid ${s.paidOrders === 1 ? "order" : "orders"}`} valueTestId="sales-all-time" />
        <StatTile label="Waiting for payment" value={s.waiting} icon={Clock} tone="red" href="/admin/sales?show=waiting" />
        <StatTile label="GuroMart's share" value={formatAmount(s.platformFees)} icon={Landmark} tone="green" note="Commission after refunds" />
        <StatTile label="Sellers' share" value={formatAmount(s.sellerEarnings)} icon={Store} tone="blue" note="Before payout" />
        <StatTile label="Refunded" value={formatAmount(s.refunded)} icon={Undo2} tone="yellow" />
        <StatTile label="Average order" value={formatAmount(s.paidOrders ? Math.round(s.allTime / s.paidOrders) : 0)} icon={Wallet} tone="red" />
      </div>
      <Card className="p-6">
        <SalesChart daily={s.daily} />
      </Card>
      {!s.complete ? <p className="text-sm text-danger">Totals count the latest 20,000 orders only.</p> : null}
    </div>
  );
}

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

type OrderRow = {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  total_centavos: number;
  refunded_centavos: number;
  payment_provider: string | null;
  paid_at: string | null;
  created_at: string;
  order_items: { title_snapshot: string; seller_accounts: { storefronts: { name: string } | { name: string }[] | null } | null }[];
  payments: { payment_method: string | null; status: string; livemode: boolean; created_at: string }[];
};

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await requireArea("admin", "/admin/sales");
  const params = await searchParams;
  const show: Show = SHOWS.some((s) => s.value === params.show) ? (params.show as Show) : "paid";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const statuses = SHOWS.find((s) => s.value === show)!.statuses;

  // Signed in as an admin above; buyers' emails and every order need the service role.
  const admin = createAdminClient();
  let query = admin
    .from("orders")
    .select(
      "id, order_number, user_id, status, total_centavos, refunded_centavos, payment_provider, paid_at, created_at, order_items(title_snapshot, seller_accounts(storefronts(name))), payments(payment_method, status, livemode, created_at)",
      { count: "exact" },
    )
    // Paid orders by when the money came in; a late payment can land well after checkout.
    .order(show === "paid" ? "paid_at" : "created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (statuses) query = query.in("status", [...statuses]);
  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load orders: ${error.message}`);
  const rows = (data ?? []) as unknown as OrderRow[];

  const buyerIds = [...new Set(rows.map((r) => r.user_id))];
  const [profiles, users] = await Promise.all([
    admin.from("profiles").select("id, display_name").in("id", buyerIds),
    Promise.all(buyerIds.map((id) => admin.auth.admin.getUserById(id))),
  ]);
  const nameOf = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));
  const emailOf = new Map(users.map((u) => [u.data.user?.id ?? "", u.data.user?.email ?? ""]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (next: { show?: Show; page?: number }) => {
    const sp = new URLSearchParams();
    const s = next.show ?? show;
    if (s !== "paid") sp.set("show", s);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return `/admin/sales${qs ? `?${qs}` : ""}`;
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="orders-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="orders-heading" className="font-display text-xl font-bold">Orders</h2>
        <nav aria-label="Show orders" className="flex flex-wrap gap-2">
          {SHOWS.map((s) => (
            <Link
              key={s.value}
              href={link({ show: s.value })}
              aria-current={s.value === show ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold",
                s.value === show ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ReceiptText aria-hidden />} title="No orders here yet">
          Orders appear here as soon as a teacher checks out.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm" data-testid="orders-table">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Buyer</th>
                <th className="px-4 py-3 font-semibold">What they bought</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Paid with</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const status = STATUS[o.status] ?? { label: o.status, tone: "bg-surface-muted" };
                const payment = [...o.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
                const shops = [...new Set(o.order_items.flatMap((i) => ([] as { name: string }[]).concat(i.seller_accounts?.storefronts ?? []).map((s) => s.name)))];
                return (
                  <tr key={o.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block font-semibold">{o.order_number}</span>
                      <span className="text-xs text-muted-foreground">{when.format(new Date(o.paid_at ?? o.created_at))}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{nameOf.get(o.user_id) || "No name yet"}</span>
                      <span className="text-xs text-muted-foreground">{emailOf.get(o.user_id)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {o.order_items.map((i, n) => (
                        <span key={n} className="block">{i.title_snapshot}</span>
                      ))}
                      {shops.length ? <span className="text-xs text-muted-foreground">from {shops.join(", ")}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {o.total_centavos === 0 ? "Free" : formatAmount(o.total_centavos)}
                      {o.refunded_centavos ? <span className="block text-xs font-normal text-muted-foreground">{formatAmount(o.refunded_centavos)} refunded</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      {o.payment_provider === "free" ? (
                        <span className="text-muted-foreground">No payment</span>
                      ) : payment ? (
                        <>
                          <span className="block">{METHOD_NAME[payment.payment_method ?? ""] ?? payment.payment_method ?? "PayMongo"}</span>
                          {!payment.livemode ? <span className="text-xs text-muted-foreground">Test payment</span> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Not started</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", status.tone)}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={link({ page: page - 1 })} className="font-semibold text-primary hover:underline">Previous</Link> : <span />}
          <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span>
          {page < pages ? <Link href={link({ page: page + 1 })} className="font-semibold text-primary hover:underline">Next</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
