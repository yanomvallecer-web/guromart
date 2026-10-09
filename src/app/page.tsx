import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, Store } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { SearchForm } from "@/components/site/search-form";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { type HomeShelf, getFeaturedStorefronts, getShelf, getTaxonomy } from "@/lib/catalog/queries";

export default function HomePage() {
  return (
    <>
      <section className="bg-primary text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[#cfe0f7]">Para sa mga guro, gawa ng mga guro</p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Everything you need to teach, all in one place.
            </h1>
          </div>
          {/* Phones already have the search field in the header. */}
          <SearchForm size="lg" className="hidden max-w-2xl border-white/0 md:flex" />
          <Suspense fallback={<div className="h-9" />}>
            <QuickCategories />
          </Suspense>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 py-12 sm:px-6">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-[12px] bg-border/50" />}>
          <BrowseBy />
        </Suspense>

        <Shelf shelf="featured" title="Featured resources" href="/browse?sort=popular" />
        <Shelf shelf="free" title="Free resources" href="/browse?price=free" />
        <Shelf shelf="popular" title="Popular downloads" href="/browse?sort=popular" />
        <Shelf shelf="new" title="Newly added" href="/browse?sort=newest" />

        <section aria-labelledby="shops-h" className="flex flex-col gap-4">
          <h2 id="shops-h" className="font-display text-2xl font-bold">Teacher shops</h2>
          <Suspense fallback={<div className="h-24 animate-pulse rounded-[12px] bg-border/50" />}>
            <Storefronts />
          </Suspense>
        </section>

        <section className="flex flex-col items-start gap-4 rounded-[16px] bg-accent-soft p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="font-display text-2xl font-bold">Sell what you already make for your class</h2>
            <p className="mt-1 text-muted-foreground">Open a shop, upload your lesson plans and worksheets, and get paid to GCash, Maya or your bank.</p>
          </div>
          <Link href="/sell" className={buttonVariants({ variant: "dark", size: "lg" })}>
            Start selling
          </Link>
        </section>
      </div>
    </>
  );
}

async function QuickCategories() {
  const { categories } = await getTaxonomy();
  const picks = ["daily-lesson-log", "lesson-plan", "worksheet", "assessment", "presentation"];
  return (
    <ul className="flex flex-wrap gap-2">
      {categories
        .filter((c) => picks.includes(c.code))
        .map((c) => (
          <li key={c.code}>
            <Link href={`/browse?category=${c.code}`} className="block rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              {c.name}
            </Link>
          </li>
        ))}
      <li>
        <Link href="/browse?price=free" className="block rounded-full bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/90">
          Free downloads
        </Link>
      </li>
    </ul>
  );
}

async function BrowseBy() {
  const { grades, subjects, categories } = await getTaxonomy();
  const group = (title: string, param: string, items: { code: string; name: string }[]) => (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.code}>
            <Link href={`/browse?${param}=${i.code}`} className="block rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-semibold hover:border-primary hover:text-primary">
              {i.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-labelledby="browse-h" className="flex flex-col gap-6">
      <h2 id="browse-h" className="font-display text-2xl font-bold">Browse by</h2>
      {group("Grade level", "grade", grades)}
      {group("Subject", "subject", subjects)}
      {group("Resource type", "category", categories)}
    </section>
  );
}

function Shelf({ shelf, title, href }: { shelf: HomeShelf; title: string; href: string }) {
  return (
    <section aria-labelledby={`${shelf}-h`} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${shelf}-h`} className="font-display text-2xl font-bold">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ShelfItems shelf={shelf} />
      </Suspense>
    </section>
  );
}

async function ShelfItems({ shelf }: { shelf: HomeShelf }) {
  const products = await getShelf(shelf);
  if (products.length === 0) {
    return (
      <EmptyState icon={<BookOpen />} title="Nothing here yet">
        {shelf === "free"
          ? "Free resources from teacher shops will show up here once they are approved."
          : "Resources appear here as teacher shops publish them. Have something to share?"}{" "}
        <Link href="/sell" className="font-semibold text-primary hover:underline">Open a shop</Link>.
      </EmptyState>
    );
  }
  return <ProductGrid products={products} />;
}

async function Storefronts() {
  const stores = await getFeaturedStorefronts();
  if (stores.length === 0) {
    return (
      <EmptyState icon={<Store />} title="The first shops are opening soon">
        Teachers who open a shop now will be listed here first.
      </EmptyState>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stores.map((s) => (
        <li key={s.slug}>
          <Link href={`/shop/${s.slug}`} className="flex h-full flex-col gap-1 rounded-[12px] border border-border bg-surface p-4 hover:border-primary">
            <span className="font-bold">{s.name}</span>
            {s.tagline ? <span className="text-sm text-muted-foreground">{s.tagline}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
