import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { ProductGrid } from "@/components/catalog/product-card";
import { EmptyState } from "@/components/ui/card";
import { browseProducts } from "@/lib/catalog/queries";
import { getStorefront } from "@/lib/catalog/storefront";
import { publicObjectUrl } from "@/lib/storage";

export async function generateMetadata({ params }: PageProps<"/shop/[slug]">): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  return { title: store?.name ?? "Shop not found" };
}

export default function ShopPage({ params }: PageProps<"/shop/[slug]">) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-border/50" />}>
        <Shop params={params} />
      </Suspense>
    </div>
  );
}

async function Shop({ params }: { params: PageProps<"/shop/[slug]">["params"] }) {
  const store = await getStorefront((await params).slug);
  if (!store) notFound();
  const products = await browseProducts({ shop: store.slug, sort: "newest" });
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        {store.banner_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicObjectUrl("storefront-media", store.banner_path)}
            alt=""
            className="aspect-[4/1] w-full rounded-[12px] border border-border object-cover"
          />
        ) : null}
        <div className="flex items-center gap-4">
          {store.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicObjectUrl("storefront-media", store.logo_path)}
              alt={`${store.name} logo`}
              className="size-16 shrink-0 rounded-full border border-border object-cover sm:size-20"
            />
          ) : null}
          <div>
            <h1 className="font-display text-3xl font-bold">{store.name}</h1>
            {store.tagline ? <p className="mt-1 text-lg text-muted-foreground">{store.tagline}</p> : null}
          </div>
        </div>
        {store.description ? <p className="max-w-2xl whitespace-pre-line">{store.description}</p> : null}
      </header>
      {products.items.length ? (
        <ProductGrid products={products.items} />
      ) : (
        <EmptyState icon={<BookOpen />} title="No resources yet">This shop hasn&apos;t published anything yet.</EmptyState>
      )}
    </div>
  );
}
