import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { SearchForm } from "@/components/site/search-form";
import { buttonVariants } from "@/components/ui/button";
import { type CatalogFacets, type Facet, type HomeShelf, getCatalogFacets, getFeaturedStorefronts, getShelf, getTaxonomy } from "@/lib/catalog/queries";
import { shopSummary } from "@/lib/catalog/labels";

/** Below this many live resources, extra shelves would only repeat the featured ones. */
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

      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-6 sm:gap-12 sm:px-6 sm:py-8">
        <Suspense fallback={<ProductGridSkeleton />}>
          <Resources />
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

/**
 * Resources first, then the grades and subjects that have some. While the
 * catalog is small, the extra shelves wait until they wouldn't repeat the
 * same few resources.
 */
async function Resources() {
  const facets = await getCatalogFacets();
  const small = facets.total < LAUNCH_THRESHOLD;
  return (
    <>
      <ShelfSection
        shelf="popular"
        id="featured-h"
        title="Featured resources"
        criteria="Most bought and downloaded first, then newest. Every resource was checked by GuroMart before it went live."
        href="/browse?sort=popular"
      />

      <GradesAndSubjects facets={facets} />

      {small ? null : (
        <>
          <ShelfSection shelf="free" id="free-h" title="Free resources" criteria="Most downloaded first." href="/browse?price=free" />
          <ShelfSection shelf="new" id="new-h" title="Newly added" criteria="Newest first." href="/browse?sort=newest" />
        </>
      )}
    </>
  );
}

/** Only grades and subjects that have live resources, with how many. */
function GradesAndSubjects({ facets }: { facets: CatalogFacets }) {
  const grades = facets.grades.filter((g) => g.count > 0);
  const subjects = facets.subjects.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  if (!grades.length && !subjects.length) return null;
  const row = (label: string, items: Facet[], key: "grade" | "subject") => (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {items.map((i) => (
          <li key={i.code} className="shrink-0">
            <Link
              href={`/browse?${key}=${i.code}`}
              className="relative flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              {i.name}{" "}
              <span className="rounded-full bg-primary-soft px-2 text-xs font-bold text-primary">
                {i.count}
                <span className="sr-only"> {i.count === 1 ? "resource" : "resources"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-labelledby="grades-h" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="grades-h" className="font-display text-2xl font-bold">Available grades and subjects</h2>
        <Link href="/browse" className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          See all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {grades.length ? row("Grades", grades, "grade") : null}
      {subjects.length ? row("Subjects", subjects, "subject") : null}
    </section>
  );
}

async function ShelfSection({ shelf, id, title, criteria, href }: { shelf: HomeShelf; id: string; title: string; criteria: string; href: string }) {
  const products = await getShelf(shelf);
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={id} className="font-display text-2xl font-bold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{criteria}</p>
        </div>
        <Link href={href} className="flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      {/* Four on phones keeps each shelf to two rows; See all has the rest. */}
      <ProductGrid products={products} className="max-md:[&>li:nth-child(n+5)]:hidden" />
    </section>
  );
}

/** Shops with live resources, most resources first, with the subjects and grades they publish for. */
async function Storefronts() {
  const [stores, facets] = await Promise.all([getFeaturedStorefronts(24), getCatalogFacets()]);
  const live = stores
    .map((s) => ({ ...s, facet: facets.shops[s.slug] }))
    .filter((s) => s.facet?.count)
    .sort((a, b) => b.facet.count - a.facet.count)
    .slice(0, 6);
  if (live.length === 0) return null;
  return (
    <section aria-labelledby="shops-h" className="flex flex-col gap-4">
      <h2 id="shops-h" className="font-display text-2xl font-bold">Teacher shops</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {live.map((s) => (
          <li key={s.slug}>
            <Link href={`/shop/${s.slug}`} className="flex h-full flex-col gap-1 rounded-[12px] border border-border bg-surface p-4 hover:border-primary">
              <span className="font-bold">{s.name}</span>
              {s.tagline ? <span className="text-sm text-muted-foreground">{s.tagline}</span> : null}
              <span className="text-sm text-muted-foreground">{shopSummary(s.facet)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
