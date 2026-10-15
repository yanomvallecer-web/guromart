import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Store } from "lucide-react";
import { BundlePromo } from "@/components/catalog/bundle-promo";
import { EmptyState, Skeleton } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getCatalogFacets, getShopDirectory } from "@/lib/catalog/queries";
import { shopSummary } from "@/lib/catalog/labels";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Teacher shops" };

export default function ShopsPage({ searchParams }: PageProps<"/shops">) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/" className="flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-primary"><ArrowLeft className="size-4" aria-hidden />Back to home</Link>
      <header>
        <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">Teacher shops</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">Meet the teachers behind the resources. Visit a shop to explore what they create.</p>
      </header>
      <BundlePromo />
      <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>}>
        <ShopDirectory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ShopDirectory({ searchParams }: { searchParams: PageProps<"/shops">["searchParams"] }) {
  const raw = (await searchParams).page;
  const page = typeof raw === "string" && /^\d{1,5}$/.test(raw) ? Math.max(1, Number(raw)) : 1;
  const [{ shops, total }, facets] = await Promise.all([getShopDirectory(page), getCatalogFacets()]);
  const pages = Math.max(1, Math.ceil(total / 24));
  return (
    <section aria-label="Shop directory" className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">{total} {total === 1 ? "teacher shop" : "teacher shops"}</p>
      {shops.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shops.map(shop => <li key={shop.slug} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
          <Link href={`/shop/${shop.slug}`} className="flex min-w-0 items-center gap-3">
            {shop.logo_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicObjectUrl("storefront-media", shop.logo_path)} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
            ) : <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Store className="size-6" /></span>}
            <span className="min-w-0 break-words font-bold">{shop.name}</span>
          </Link>
          {shop.tagline ? <p className="break-words text-sm leading-relaxed text-muted-foreground">{shop.tagline}</p> : null}
          <p className="text-xs leading-relaxed text-muted-foreground">{facets.shops[shop.slug] ? shopSummary(facets.shops[shop.slug]) : "No published resources yet"}</p>
          <Link href={`/shop/${shop.slug}`} className={cn(buttonVariants({ variant: "outline" }), "mt-auto w-full")}>Visit shop <ArrowRight className="size-4" aria-hidden /></Link>
        </li>)}
      </ul> : <EmptyState icon={<Store />} title={total ? "No shops on this page" : "Teacher shops are on their way"}>Explore resources while teachers set up their shops. <Link href="/browse" className="font-semibold text-primary hover:underline">Browse resources</Link></EmptyState>}
      {pages > 1 || page > 1 ? <nav aria-label="Shop pages" className="flex flex-wrap items-center gap-3">
        {page > 1 ? <Link href={`/shops?page=${Math.min(page - 1, pages)}`} className={buttonVariants({ variant: "outline" })}>Previous</Link> : null}
        <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
        {page < pages ? <Link href={`/shops?page=${page + 1}`} className={buttonVariants({ variant: "outline" })}>Next</Link> : null}
      </nav> : null}
    </section>
  );
}
