import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { getTaxonomy } from "@/lib/catalog/queries";
import { getSellerContext } from "@/lib/listings/seller";
import { NewListingForm } from "./new-listing-form";

export const metadata: Metadata = { title: "New resource" };

export default function NewListingPage() {
  return (
    <PageShell title="New resource" description="Start with a title and type. You can fill in the rest and upload files next.">
      <Suspense fallback={<PanelSkeleton />}>
        <NewListing />
      </Suspense>
    </PageShell>
  );
}

async function NewListing() {
  const viewer = await requireArea("seller", "/seller/products/new");
  if (!(await getSellerContext(viewer))) redirect("/sell");
  const { categories } = await getTaxonomy();
  return (
    <Card className="max-w-xl p-6">
      <NewListingForm categories={categories.map((c) => ({ code: c.code, name: c.name }))} />
    </Card>
  );
}
