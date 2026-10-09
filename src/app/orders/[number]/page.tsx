import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { ORDER_STATUS, getOrder } from "@/lib/commerce/orders";
import { formatPrice } from "@/lib/format";
import { RefreshWhilePending } from "./refresh-while-pending";

export const metadata: Metadata = { title: "Order" };

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const METHOD: Record<string, string> = { gcash: "GCash", paymaya: "Maya", card: "Card", grab_pay: "GrabPay", qrph: "QR Ph" };

export default function OrderPage({ params }: PageProps<"/orders/[number]">) {
  return (
    <PageShell title="Order" description={<Link href="/orders" className="text-primary hover:underline">All orders</Link>}>
      <Suspense fallback={<PanelSkeleton />}>
        <Order params={params} />
      </Suspense>
    </PageShell>
  );
}

async function Order({ params }: { params: PageProps<"/orders/[number]">["params"] }) {
  const { number } = await params;
  await requireViewer(`/orders/${number}`);
  const order = await getOrder(number);
  if (!order) notFound();
  const status = ORDER_STATUS[order.status];

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">{order.order_number}</h2>
          <Badge data-testid="order-status" className={status.tone === "success" ? "bg-success-soft text-success" : status.tone === "warning" ? "bg-primary-soft text-primary" : "bg-surface-muted text-muted-foreground"}>
            {status.label}
          </Badge>
        </div>
        {order.status === "pending_payment" ? (
          <div className="flex items-start gap-3 rounded-[10px] bg-surface-muted p-4 text-sm">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <p>
              Waiting for PayMongo to confirm your payment. Your resources unlock as soon as it does, usually within a minute.
              If you didn&apos;t finish paying, nothing was charged.
            </p>
            <RefreshWhilePending />
          </div>
        ) : null}
        {order.status === "paid" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-success-soft p-4 text-sm">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-5 text-success" aria-hidden /> Payment received. Your resources are in your library.</p>
            <Link href="/library" className={buttonVariants({ size: "sm" })}>Open my library</Link>
          </div>
        ) : null}
        <ul className="divide-y divide-border">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 py-2 text-sm">
              <span>{i.title_snapshot}</span>
              <span className="font-medium">{formatPrice(i.unit_price_centavos)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-border pt-3 font-semibold">
          <span>Total</span>
          <span>{formatPrice(order.total_centavos)}</span>
        </div>
      </Card>
      <Card className="flex h-fit flex-col gap-2 p-5 text-sm">
        <h2 className="font-display text-lg font-bold">Receipt</h2>
        <p><span className="text-muted-foreground">Ordered:</span> {dateFmt.format(new Date(order.created_at))}</p>
        {order.paid_at ? <p><span className="text-muted-foreground">Paid:</span> {dateFmt.format(new Date(order.paid_at))}</p> : null}
        {order.payment?.payment_method ? <p><span className="text-muted-foreground">Paid with:</span> {METHOD[order.payment.payment_method] ?? order.payment.payment_method}</p> : null}
        <p className="text-muted-foreground">Payments are processed by PayMongo. Test mode: no real money moves.</p>
      </Card>
    </div>
  );
}
