import Link from "next/link";
import { BannerCircles } from "@/components/layout/page-shell";
import { Suspense } from "react";
import { ArrowRight, CheckCircle2, Download, Eye, Search, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { SearchForm } from "@/components/site/search-form";
import { buttonVariants } from "@/components/ui/button";
import { type CatalogFacets, type Facet, type HomeShelf, getCatalogFacets, getFeaturedStorefronts, getShelf, getTaxonomy } from "@/lib/catalog/queries";
import { getLiveBundleCards } from "@/lib/catalog/bundles";
import { displayTitle, shopSummary } from "@/lib/catalog/labels";
import { getSellerPlans } from "@/lib/platform-settings";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** Below this many live resources, a one-line note says the catalog is new, and extra shelves would only repeat the featured ones. */
const LAUNCH_THRESHOLD = 8;

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-primary text-white">
        <BannerCircles />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-8 sm:px-6 sm:py-14 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[#cfe0f7]">Para sa mga guro, gawa ng mga guro</p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[56px]">
                Everything you need to teach, all in one place.
              </h1>
              <p className="mt-4 max-w-xl text-lg text-[#dbe7f8]">
                Lesson plans, DLLs, slides and worksheets made by Filipino teachers. Every one is checked by GuroMart before it goes live.
              </p>
            </div>
            {/* Phones already have the search field in the header. */}
            <SearchForm size="lg" className="hidden max-w-2xl border-white/0 md:flex" />
            <Suspense fallback={<div className="h-9" />}>
              <QuickCategories />
            </Suspense>
            <Suspense fallback={<div className="h-6" />}>
              <HeroCounts />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <HeroCovers />
          </Suspense>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-6 sm:gap-14 sm:px-6 sm:py-10">
        <Suspense fallback={<ProductGridSkeleton />}>
          <Resources />
        </Suspense>

        <HowItWorks />

        <Suspense fallback={null}>
          <Storefronts />
        </Suspense>

        <Suspense fallback={null}>
          <SellBand />
        </Suspense>
      </div>
    </>
  );
}

/** The catalog's real size, so a teacher knows what they'll find. */
async function HeroCounts() {
  const facets = await getCatalogFacets();
  if (!facets.total) return null;
  const shops = Object.keys(facets.shops).length;
  const grades = facets.grades.filter((g) => g.count > 0).length;
  const items = [
    { value: facets.total, label: facets.total === 1 ? "resource" : "resources" },
    { value: shops, label: shops === 1 ? "teacher shop" : "teacher shops" },
    { value: grades, label: grades === 1 ? "grade level" : "grade levels" },
    ...(facets.free ? [{ value: facets.free, label: "free to download" }] : []),
  ];
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#dbe7f8]" data-testid="hero-counts">
      {items.map((i) => (
        <li key={i.label} className="flex items-baseline gap-1.5">
          <span className="font-display text-2xl font-bold text-white">{count.format(i.value)}</span> {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Three real covers from the most popular resources, fanned out like papers on a desk. */
async function HeroCovers() {
  const covers = (await getShelf("popular")).filter((p) => p.preview_path).slice(0, 3);
  if (covers.length < 2) return null;
  // Two papers behind, spread left and right, and one in front between them.
  const place = ["left-0 top-6 -rotate-6", "right-0 top-0 rotate-6", "left-[19%] top-[150px] -rotate-1"];
  return (
    <div className="relative hidden h-[400px] lg:block" aria-label="Popular resources">
      {covers.map((p, i) => (
        <Link
          key={p.id}
          href={`/resources/${p.slug}`}
          className={cn(
            "absolute w-[62%] overflow-hidden rounded-[14px] border-4 border-white bg-white shadow-2xl transition hover:z-10 hover:rotate-0 hover:scale-[1.03]",
            place[i],
          )}
          style={{ zIndex: i + 1 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicObjectUrl("product-previews", p.preview_path!)} alt={displayTitle(p)} className="aspect-[4/3] w-full object-cover object-top" />
        </Link>
      ))}
      <span className="absolute bottom-2 right-0 z-20 flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-foreground shadow-lg">
        <ShieldCheck className="size-4" aria-hidden /> Checked by GuroMart
      </span>
    </div>
  );
}

/** What a teacher does, in the order they do it. Each step says only what the site really does. */
function HowItWorks() {
  const steps = [
    { icon: Search, title: "Find it fast", text: "Search or filter by grade, subject, quarter and resource type." },
    { icon: Eye, title: "See inside first", text: "Every resource shows its cover and pages from inside before you buy." },
    { icon: Wallet, title: "Pay online", text: "Pay through PayMongo, for example with GCash or Maya. Free resources need no payment." },
    { icon: Download, title: "Download anytime", text: "Your files stay in My Library, ready to download again whenever you need them." },
  ];
  return (
    <section aria-labelledby="how-h" className="flex flex-col gap-5">
      <h2 id="how-h" className="font-display text-2xl font-bold">How GuroMart works</h2>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex flex-col gap-2 rounded-[16px] border border-border bg-surface p-5">
            <span className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="font-display text-sm font-bold text-muted-foreground">Step {i + 1}</span>
            </span>
            <h3 className="font-display text-lg font-bold">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The invitation to sell, with the real fee and payout terms. */
async function SellBand() {
  const plans = await getSellerPlans();
  const keep = 100 - plans.starterBps / 100;
  const points = [
    `Free to open a shop. You keep ${keep}% of each sale.`,
    "Upload a file and previews are made for you.",
    `Get paid to GCash, Maya or your bank from ₱${count.format(plans.minPayoutCentavos / 100)}.`,
  ];
  return (
    <section className="relative overflow-hidden rounded-[20px] bg-accent p-6 sm:p-10">
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-white/25" />
      <div className="relative grid items-center gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="font-display text-3xl font-extrabold leading-tight text-foreground">Sell what you already make for your class</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 font-medium text-foreground">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex lg:justify-end">
          <Link href="/sell" className={buttonVariants({ variant: "dark", size: "lg" })}>
            Start selling <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

const count = new Intl.NumberFormat("en-PH");

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
        <Link href="/bundles" className="block rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
          Lesson bundles
        </Link>
      </li>
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
 * catalog is small, a one-line note says so, and the extra shelves wait
 * until they wouldn't repeat the same few resources.
 */
async function Resources() {
  const facets = await getCatalogFacets();
  const small = facets.total < LAUNCH_THRESHOLD;
  const shops = Object.keys(facets.shops).length;
  return (
    <>
      {small ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] border border-border bg-surface px-4 py-3 text-sm" data-testid="launch-note">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
          <span>
            <strong className="font-semibold">GuroMart is new.</strong> {facets.total} {facets.total === 1 ? "resource" : "resources"} from {shops}{" "}
            {shops === 1 ? "teacher shop" : "teacher shops"} so far. More appear as each one passes review.
          </span>
          <Link href="/sell" className="font-semibold text-primary hover:underline">Sell yours</Link>
        </p>
      ) : null}

      <ShelfSection
        shelf="popular"
        id="featured-h"
        title="Featured resources"
        criteria="The newest lesson bundles, then the most bought and downloaded resources. Every resource was checked by GuroMart before it went live."
        href="/browse?sort=popular"
        withBundles
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
      <h2 id="grades-h" className="font-display text-2xl font-bold">Available grades and subjects</h2>
      {grades.length ? row("Grades", grades, "grade") : null}
      {subjects.length ? row("Subjects", subjects, "subject") : null}
      <Link href="/browse" className="flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline">
        Browse all resources <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

/** Up to this many lesson bundles lead the featured shelf. */
const FEATURED_BUNDLES = 2;

async function ShelfSection({
  shelf,
  id,
  title,
  criteria,
  href,
  withBundles = false,
}: {
  shelf: HomeShelf;
  id: string;
  title: string;
  criteria: string;
  href: string;
  withBundles?: boolean;
}) {
  const [products, bundles] = await Promise.all([getShelf(shelf), withBundles ? getLiveBundleCards({ limit: FEATURED_BUNDLES }) : []]);
  if (products.length === 0 && bundles.length === 0) return null;
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
      <ProductGrid products={products.slice(0, 8 - bundles.length)} bundles={bundles} className="max-md:[&>li:nth-child(n+5)]:hidden" />
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
            <Link
              href={`/shop/${s.slug}`}
              className="flex h-full items-center gap-4 rounded-[16px] border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              {s.logo_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={publicObjectUrl("storefront-media", s.logo_path)} alt="" className="size-14 shrink-0 rounded-full border border-border object-cover" />
              ) : (
                <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xl font-bold text-white">
                  {s.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-bold">{s.name}</span>
                {s.tagline ? <span className="line-clamp-1 text-sm text-muted-foreground">{s.tagline}</span> : null}
                <span className="text-sm text-muted-foreground">{shopSummary(s.facet)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
