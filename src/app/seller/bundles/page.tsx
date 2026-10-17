import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/format";
import { getSellerContext } from "@/lib/listings/seller";
import { createClient } from "@/lib/supabase/server";
import { BUNDLE_STATUS } from "@/lib/catalog/bundle-status";
import { NewBundleForm } from "./bundle-forms";

export const metadata: Metadata = { title: "Lesson bundles" };

export default function SellerBundlesPage() {
  return (
    <PageShell
      title="Lesson bundles"
      description="Sell a lesson plan, slides, worksheet and assessment on one topic together, for less than they cost separately."
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Bundles />
      </Suspense>
    </PageShell>
  );
}

async function Bundles() {
  const viewer = await requireArea("seller", "/seller/bundles");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  const supabase = await createClient();
  const { data: bundles } = await supabase
    .from("bundles")
    .select("id, title, price_centavos, status, bundle_items(product_id)")
    .eq("storefront_id", ctx.storefront.id)
    .order("created_at", { ascending: false });
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div>
        {bundles?.length ? (
          <Card className="divide-y divide-border">
            {bundles.map((b) => {
              const status = BUNDLE_STATUS[b.status] ?? BUNDLE_STATUS.draft;
              return (
                <Link key={b.id} href={`/seller/bundles/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-muted sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{b.title}</p>
                    <p className="text-sm text-muted-foreground">{b.bundle_items.length} {b.bundle_items.length === 1 ? "resource" : "resources"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatPrice(b.price_centavos)}</span>
                    <Badge className={status.tone}>{status.label}</Badge>
                  </div>
                </Link>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon={<Layers aria-hidden />} title="No bundles yet">
            Bundles are made from your live, paid resources. Put two or more on the same topic together and set a lower price.
          </EmptyState>
        )}
      </div>
      <Card className="h-fit p-6">
        <h2 className="mb-4 font-display text-xl font-bold">New bundle</h2>
        <NewBundleForm />
      </Card>
    </div>
  );
}
