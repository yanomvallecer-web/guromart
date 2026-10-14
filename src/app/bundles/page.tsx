import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Layers } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { EmptyState } from "@/components/ui/card";
import { getLiveBundleCards } from "@/lib/catalog/bundles";

export const metadata: Metadata = { title: "Lesson bundles" };

export default function BundlesPage() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">Lesson bundles</h1>
        <p className="text-muted-foreground">Sets of resources from one shop, sold together for less than buying each one.</p>
      </header>
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <Bundles />
      </Suspense>
    </div>
  );
}

async function Bundles() {
  const bundles = await getLiveBundleCards({ limit: 48 });
  if (!bundles.length) {
    return (
      <EmptyState icon={<Layers />} title="No bundles yet">
        Shops haven&apos;t published any bundles yet.{" "}
        <Link href="/browse" className="font-semibold text-primary hover:underline">Browse single resources</Link>
      </EmptyState>
    );
  }
  return <ProductGrid products={[]} bundles={bundles} />;
}
