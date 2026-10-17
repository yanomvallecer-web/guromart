import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Receipt } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card, EmptyState } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { listOrders, orderStatus } from "@/lib/commerce/orders";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Orders" };

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export default function OrdersPage() {
  return (
    <PageShell title="Orders" description="Your purchases and receipts.">
      <Suspense fallback={<PanelSkeleton />}>
        <Orders />
      </Suspense>
    </PageShell>
  );
}

async function Orders() {
  await requireViewer("/orders");
  const orders = await listOrders();
  if (orders.length === 0) {
    return <EmptyState icon={<Receipt />} title="No orders yet">Paid resources you buy will be listed here with their receipts.</EmptyState>;
  }
  return (
    <Card className="divide-y divide-border">
      {orders.map((o) => (
        <Link key={o.id} href={`/orders/${o.order_number}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-muted">
          <span className="font-semibold">{o.order_number}</span>
          <span className="text-sm text-muted-foreground">{dateFmt.format(new Date(o.created_at))}</span>
          <span className={orderStatus(o).tone === "danger" ? "text-sm text-danger" : "text-sm"}>{orderStatus(o).label}</span>
          <span className="font-semibold">{formatPrice(o.total_centavos)}</span>
        </Link>
      ))}
    </Card>
  );
}
