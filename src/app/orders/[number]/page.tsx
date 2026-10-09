import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { getOrder, orderStatus } from "@/lib/commerce/orders";
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
  const status = orderStatus(order);
  const paymentFailed = order.status === "failed" || (order.status === "pending_payment" && order.payment?.status === "failed");

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">{order.order_number}</h2>
          <Badge data-testid="order-status" className={status.tone === "success" ? "bg-success-soft text-success" : status.tone === "warning" ? "bg-primary-soft text-primary" : status.tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-muted text-muted-foreground"}>
            {status.label}
          </Badge>
        </div>
        {paymentFailed ? (
          <Problem title="Your payment didn't go through">
            {order.payment?.failure_reason ? <p>PayMongo said: &ldquo;{order.payment.failure_reason}&rdquo;</p> : null}
            <p>
              Nothing was charged for this attempt. You can try again on the PayMongo page if it&apos;s still open, or go back to
              your cart and pay again, perhaps with a different method such as GCash or Maya.
            </p>
            {order.status === "pending_payment" ? <RefreshWhilePending /> : null}
          </Problem>
        ) : null}
        {order.status === "expired" ? (
          <Problem title="This order expired">
            <p>
              The payment wasn&apos;t finished within a day, so we closed this order and nothing was charged. To get these
              resources, go back to your cart and check out again.
            </p>
            <p className="text-muted-foreground">
              If PayMongo did take a payment for this order, you don&apos;t need to do anything: it will still be confirmed here and
              the resources will appear in your library.
            </p>
          </Problem>
        ) : null}
        {order.status === "cancelled" ? (
          <Problem title="We couldn't open the payment page">
            <p>Nothing was charged for this order. Go back to your cart to try again.</p>
          </Problem>
        ) : null}
        {order.status === "pending_payment" && !paymentFailed ? (
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

/** A plain explanation of why an order isn't paid, with the way back to the cart. */
function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" data-testid="order-problem" className="flex items-start gap-3 rounded-[10px] bg-danger-soft p-4 text-sm">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{title}</p>
        {children}
        <Link href="/cart" className={buttonVariants({ size: "sm", className: "w-fit" })}>Back to my cart</Link>
      </div>
    </div>
  );
}
