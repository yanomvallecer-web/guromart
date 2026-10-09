import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { SearchForm } from "@/components/site/search-form";
import { buttonVariants } from "@/components/ui/button";
import { type HomeShelf, countProducts, getFeaturedStorefronts, getShelf, getTaxonomy } from "@/lib/catalog/queries";

/** Below this many live resources the shelves would look bare, so the homepage explains the launch instead. */
const LAUNCH_THRESHOLD = 8;

export default function HomePage() {
  return (
    <>
      <section className="bg-primary text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-16">
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

      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-8 sm:gap-14 sm:px-6 sm:py-12">
        <Suspense fallback={<div className="h-24 animate-pulse rounded-[12px] bg-border/50" />}>
          <GradeRow />
        </Suspense>

        <Suspense fallback={<ProductGridSkeleton />}>
          <Shelves />
        </Suspense>

        <Suspense fallback={null}>
          <Storefronts />
        </Suspense>

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

/** Grades in one swipeable row; subjects and types are in Browse's filters. */
async function GradeRow() {
  const { grades } = await getTaxonomy();
  return (
    <section aria-labelledby="grades-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="grades-h" className="font-display text-2xl font-bold">Browse by grade</h2>
        <Link href="/browse" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          See all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {grades.map((g) => (
          <li key={g.code} className="shrink-0">
            <Link href={`/browse?grade=${g.code}`} className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-primary hover:text-primary">
              {g.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * While only a handful of resources are live, one honest launch message and a
 * single "Newly added" shelf instead of four shelves repeating the same few.
 * Each shelf appears only when it has something on it.
 */
async function Shelves() {
  const live = await countProducts({});
  if (live < LAUNCH_THRESHOLD) {
    return (
      <>
        <LaunchNotice live={live} />
        <Shelf shelf="new" title="Newly added" href="/browse?sort=newest" />
      </>
    );
  }
  return (
    <>
      <Shelf shelf="featured" title="Featured resources" href="/browse?sort=popular" />
      <Shelf shelf="free" title="Free resources" href="/browse?price=free" />
      <Shelf shelf="popular" title="Popular downloads" href="/browse?sort=popular" />
      <Shelf shelf="new" title="Newly added" href="/browse?sort=newest" />
    </>
  );
}

function LaunchNotice({ live }: { live: number }) {
  return (
    <section aria-labelledby="launch-h" className="flex flex-col gap-4 rounded-[16px] border border-border bg-surface p-6 sm:p-8">
      <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-foreground" aria-hidden>
        <Sparkles className="size-5" />
      </span>
      <div>
        <h2 id="launch-h" className="font-display text-2xl font-bold">GuroMart is just opening</h2>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Teacher shops are joining now, and their lesson plans, DLLs and worksheets appear here as each one is checked and approved.
          {live > 0 ? " Have a look at what's already in, or open a shop of your own." : " Open a shop of your own and be one of the first."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/browse" className={buttonVariants({ size: "lg" })}>Browse resources</Link>
        <Link href="/sell" className={buttonVariants({ variant: "outline", size: "lg" })}>Sell on GuroMart</Link>
      </div>
    </section>
  );
}

function Shelf({ shelf, title, href }: { shelf: HomeShelf; title: string; href: string }) {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <ShelfSection shelf={shelf} title={title} href={href} />
    </Suspense>
  );
}

async function ShelfSection({ shelf, title, href }: { shelf: HomeShelf; title: string; href: string }) {
  const products = await getShelf(shelf);
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={`${shelf}-h`} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${shelf}-h`} className="font-display text-2xl font-bold">{title}</h2>
        <Link href={href} className="flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      {/* Four on phones keeps each shelf to two rows; See all has the rest. */}
      <ProductGrid products={products} className="max-md:[&>li:nth-child(n+5)]:hidden" />
    </section>
  );
}

async function Storefronts() {
  const stores = await getFeaturedStorefronts();
  if (stores.length === 0) return null;
  return (
    <section aria-labelledby="shops-h" className="flex flex-col gap-4">
      <h2 id="shops-h" className="font-display text-2xl font-bold">Teacher shops</h2>
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
    </section>
  );
}
