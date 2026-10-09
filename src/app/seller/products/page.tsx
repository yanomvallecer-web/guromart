import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, Plus } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/format";
import { getSellerContext, listOwnListings } from "@/lib/listings/seller";
import { LISTING_STATUS } from "@/lib/listings/status";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your resources" };

export default function SellerProductsPage() {
  return (
    <PageShell
      title="Your resources"
      description="Drafts, listings in review and live resources in your shop."
      actions={
        <Button asChild>
          <Link href="/seller/products/new">
            <Plus aria-hidden /> New resource
          </Link>
        </Button>
      }
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Listings />
      </Suspense>
    </PageShell>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

async function Listings() {
  const viewer = await requireArea("seller", "/seller/products");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  const listings = await listOwnListings(ctx.storefront.id);

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<FileText aria-hidden />}
        title="No resources yet"
        action={
          <Button asChild>
            <Link href="/seller/products/new">Add your first resource</Link>
          </Button>
        }
      >
        Start a draft, upload your files and preview images, then send it to GuroMart for review.
      </EmptyState>
    );
  }

  return (
    <Card className="divide-y divide-border">
      {listings.map((l) => {
        const status = LISTING_STATUS[l.status] ?? LISTING_STATUS.draft;
        return (
          <Link
            key={l.id}
            href={`/seller/products/${l.id}`}
            className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-muted sm:px-6"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{l.title}</p>
              <p className="text-sm text-muted-foreground">Updated {dateFmt.format(new Date(l.updated_at))}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{formatPrice(l.price_centavos)}</span>
              <Badge className={status.tone}>{status.label}</Badge>
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
