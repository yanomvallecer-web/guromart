import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { getEarnings } from "@/lib/commerce/earnings";
import { formatAmount } from "@/lib/format";
import { getSellerContext } from "@/lib/listings/seller";
import { getSellerPlans } from "@/lib/platform-settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Earnings" };

const dayFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
// Release dates are already Philippine calendar days (YYYY-MM-DD).
const releaseFmt = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function SellerEarningsPage() {
  return (
    <PageShell
      title="Earnings"
      description={<>What your sales have earned and when you can be paid. <Link href="/seller" className="text-primary hover:underline">Seller dashboard</Link></>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <EarningsView />
      </Suspense>
    </PageShell>
  );
}

async function EarningsView() {
  const viewer = await requireArea("seller", "/seller/earnings");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  const supabase = await createClient();
  const [earnings, plans, account] = await Promise.all([
    getEarnings(ctx.sellerAccountId),
    getSellerPlans(),
    supabase.from("seller_accounts").select("verification_status").eq("id", ctx.sellerAccountId).single(),
  ]);
  const verified = account.data?.verification_status === "verified";

  if (earnings.salesCount === 0) {
    return (
      <EmptyState
        icon={<Wallet aria-hidden />}
        title="No sales yet"
        action={<Link href="/seller/products" className={buttonVariants({ variant: "outline" })}>Manage your resources</Link>}
      >
        When a teacher buys one of your resources, your share of the price shows up here. Each sale is held for {plans.holdDays} days,
        then it becomes available for payout.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="On hold" value={earnings.pendingCentavos} testId="earnings-pending">
          Sales from the last {plans.holdDays} days, kept in case of a refund.
        </Stat>
        <Stat label="Available" value={earnings.availableCentavos} testId="earnings-available">
          Past the hold and ready to be paid out.
        </Stat>
        <Stat label="Lifetime earnings" value={earnings.lifetimeCentavos} testId="earnings-lifetime">
          Your share of every sale, from {earnings.salesCount} {earnings.salesCount === 1 ? "sale" : "sales"}.
        </Stat>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 font-display text-xl font-bold">Recent sales</h2>
          <ul className="divide-y divide-border" aria-label="Recent sales">
            {earnings.recentSales.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-3 text-sm" data-testid="earnings-sale">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{s.title}</span>
                  <span className="text-muted-foreground">{timeFmt.format(new Date(s.createdAt))}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-muted-foreground">Price</dt>
                    <dd>{formatAmount(s.priceCentavos)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">GuroMart fee ({s.commissionBps / 100}%)</dt>
                    <dd>-{formatAmount(s.platformFeeCentavos)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Your share</dt>
                    <dd className="font-semibold">{formatAmount(s.earningsCentavos)}</dd>
                  </div>
                </dl>
                <div>
                  {s.onHold ? (
                    <Badge>On hold until {dayFmt.format(new Date(s.availableAt))}</Badge>
                  ) : (
                    <Badge className="bg-success-soft text-success">Available</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {earnings.salesCount > earnings.recentSales.length ? (
            <p className="pt-3 text-sm text-muted-foreground">Showing your latest {earnings.recentSales.length} of {earnings.salesCount} sales.</p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-display text-lg font-bold">When held money becomes available</h2>
            {earnings.releases.length === 0 ? (
              <p className="text-muted-foreground">Nothing is on hold right now.</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="earnings-releases">
                {earnings.releases.map((r) => (
                  <li key={r.date} className="flex justify-between gap-3">
                    <span>{releaseFmt.format(new Date(`${r.date}T00:00:00Z`))}</span>
                    <span className="font-semibold">{formatAmount(r.amountCentavos)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-muted-foreground">Each sale becomes available {plans.holdDays} days after the buyer paid.</p>
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-display text-lg font-bold">Getting paid</h2>
            <p className="text-muted-foreground">
              Payouts aren&apos;t automatic yet. The GuroMart team sends them to your GCash, Maya or bank account once your available
              balance reaches {formatAmount(plans.minPayoutCentavos)}
              {verified ? "." : " and your identity is verified."}
            </p>
            {verified ? null : (
              <Link href="/seller/verify" className="mt-2 inline-block font-semibold text-primary hover:underline">Verify your identity and add payout details</Link>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, testId, children }: { label: string; value: number; testId: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold" data-testid={testId}>{formatAmount(value)}</p>
      <p className="text-xs text-muted-foreground">{children}</p>
    </Card>
  );
}
