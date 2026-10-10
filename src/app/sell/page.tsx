import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/dal";
import { getSellerPlans } from "@/lib/platform-settings";
import { StartSellingForm } from "./start-selling-form";

export const metadata: Metadata = { title: "Sell on GuroMart" };

export default function SellPage() {
  return (
    <PageShell title="Sell on GuroMart" description="Open a shop for the lesson plans, worksheets and slides you already make.">
      <Suspense fallback={<PanelSkeleton />}>
        <Plans />
      </Suspense>
      <Suspense fallback={<PanelSkeleton />}>
        <StartSection />
      </Suspense>
    </PageShell>
  );
}

async function Plans() {
  const plans = await getSellerPlans();
  return (
    <section aria-labelledby="plans-h" className="flex flex-col gap-3">
      <h2 id="plans-h" className="font-display text-xl font-bold">How you get paid</h2>
      {plans.proBps < plans.starterBps ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <p className="font-semibold">Starter · free</p>
            <p className="mt-1 font-display text-3xl font-bold">You keep {100 - plans.starterBps / 100}%</p>
            <p className="mt-2 text-sm text-muted-foreground">GuroMart&apos;s share covers payment fees, hosting and buyer support.</p>
          </Card>
          <Card className="p-5">
            <p className="font-semibold">Pro</p>
            <p className="mt-1 font-display text-3xl font-bold">You keep {100 - plans.proBps / 100}%</p>
            <p className="mt-2 text-sm text-muted-foreground">For active sellers. Pro sign-up opens with payments.</p>
          </Card>
        </div>
      ) : (
        <Card className="p-5">
          <p className="font-semibold">Free to sell</p>
          <p className="mt-1 font-display text-3xl font-bold">You keep {100 - plans.starterBps / 100}% of every sale</p>
          <p className="mt-2 text-sm text-muted-foreground">
            GuroMart keeps {plans.starterBps / 100}%, which covers payment fees, hosting and buyer support. No monthly fee.
          </p>
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Payouts go to GCash, Maya or your bank once your balance reaches ₱{plans.minPayoutCentavos / 100}. New earnings are held {plans.holdDays} days to cover refunds.
      </p>
    </section>
  );
}

async function StartSection() {
  const viewer = await getViewer();
  if (viewer?.roles.includes("seller")) redirect("/seller");
  return (
    <Card className="p-6">
      <h2 className="mb-1 font-display text-xl font-bold">Open your shop</h2>
      {viewer ? (
        <>
          <p className="mb-6 text-sm text-muted-foreground">Next you will verify your identity, add payout details and upload your first resource.</p>
          <StartSellingForm />
        </>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted-foreground">Sign in or create a free account first. It takes a minute with your email.</p>
          <Link href="/sign-in?next=/sell" className={buttonVariants({ size: "lg" })}>
            Sign in to start selling
          </Link>
        </div>
      )}
    </Card>
  );
}
