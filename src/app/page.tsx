import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpen,
  BookOpenText,
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  Flag,
  FlaskConical,
  GraduationCap,
  HeartHandshake,
  Landmark,
  Languages,
  type LucideIcon,
  MessageCircle,
  Music,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Wallet,
  Wrench,
} from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/product-card";
import { BundlePromo } from "@/components/catalog/bundle-promo";
import { SearchForm } from "@/components/site/search-form";
import { buttonVariants } from "@/components/ui/button";
import {
  type CatalogFacets,
  type Facet,
  type HomeShelf,
  type ProductCard,
  getCatalogFacets,
  getFeaturedStorefronts,
  getShelf,
  getTaxonomy,
} from "@/lib/catalog/queries";
import { getLiveBundleCards } from "@/lib/catalog/bundles";
import { displayTitle, shopSummary } from "@/lib/catalog/labels";
import { getSellerPlans } from "@/lib/platform-settings";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import "./guest-home.css";

/** Below this many live resources, a one-line note says the catalog is new, and extra shelves would only repeat the featured ones. */
const LAUNCH_THRESHOLD = 8;

const count = new Intl.NumberFormat("en-PH");

export default function HomePage() {
  return (
    <div data-guest-home>
      {/* Hero: light, like paper on a teacher's desk, with real covers drifting past on the right. */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-96 rounded-full bg-primary-soft/40" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch lg:pb-0 lg:pt-0">
          <div className="flex min-w-0 flex-col gap-5 lg:py-16">
            <p className="w-fit max-w-full rounded-full bg-primary-soft px-3 py-1.5 text-[10px] font-bold uppercase leading-relaxed tracking-[0.06em] text-primary sm:text-xs">
              Para sa mga guro, gawa ng mga guro
            </p>
            <h1 className="guest-hero-title font-display text-[32px] font-extrabold leading-[1.15] tracking-tight text-foreground min-[390px]:text-[36px] sm:text-[44px] lg:text-[52px]">
              Everything you need to{" "}
              <span className="relative whitespace-nowrap">
                <span aria-hidden className="absolute inset-x-[-4px] bottom-1 -z-0 h-[0.38em] -rotate-1 rounded-sm bg-accent" />
                <span className="relative">teach</span>
              </span>
              , all in one place.
            </h1>
            <p className="max-w-xl text-[15px] leading-[1.7] text-muted-foreground sm:text-base">
              Lesson plans, DLLs, slides and worksheets made by Filipino teachers. Every one is checked by GuroMart before it goes live.
            </p>
            {/* Phones already have the search field in the header. */}
            <div className="hidden max-w-2xl rounded-[18px] bg-surface p-2 shadow-xl shadow-primary/10 ring-1 ring-border md:block">
              <SearchForm size="lg" className="border-0" />
            </div>
            <Suspense fallback={<div className="h-9" />}>
              <QuickCategories />
            </Suspense>
            <Suspense fallback={<div className="h-6" />}>
              <HeroCounts />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <CoverWall />
          </Suspense>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-8 sm:gap-16 sm:px-6 sm:py-12">
        <BundlePromo />
        <Suspense fallback={<ProductGridSkeleton />}>
          <Resources />
        </Suspense>
      </div>

      <HowItWorks />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-8 sm:gap-16 sm:px-6 sm:py-12">
        <Suspense fallback={null}>
          <Storefronts />
        </Suspense>
        <Suspense fallback={null}>
          <SellBand />
        </Suspense>
      </div>
    </div>
  );
}

async function QuickCategories() {
  const { categories } = await getTaxonomy();
  const picks = ["daily-lesson-log", "lesson-plan", "worksheet", "assessment", "presentation"];
  const chip = "flex min-h-11 items-center rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold leading-snug text-foreground hover:border-primary hover:text-primary sm:text-sm";
  return (
    <ul className="flex flex-wrap gap-2">
      {categories
        .filter((c) => picks.includes(c.code))
        .map((c) => (
          <li key={c.code}>
            <Link href={`/browse?category=${c.code}`} className={chip}>
              {c.name}
            </Link>
          </li>
        ))}
      <li>
        <Link href="/bundles" className={chip}>
          Lesson bundles
        </Link>
      </li>
      <li>
        <Link href="/browse?price=free" className="flex min-h-11 items-center rounded-full border border-primary/20 bg-primary-soft px-3.5 py-2 text-xs font-semibold leading-snug text-primary hover:border-primary sm:text-sm">
          Free downloads
        </Link>
      </li>
    </ul>
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
    <ul className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-8 sm:text-sm" data-testid="hero-counts">
      {items.map((i) => (
        <li key={i.label} className="flex flex-col">
          <span className="font-display text-2xl font-extrabold text-primary sm:text-3xl">{count.format(i.value)}</span> {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Two columns of real covers from popular resources, drifting upward. Hovering pauses them. */
async function CoverWall() {
  const covers = (await getShelf("popular", 16)).filter((p) => p.preview_path).slice(0, 10);
  if (covers.length < 4) return null;
  const left = covers.filter((_, i) => i % 2 === 0);
  const right = covers.filter((_, i) => i % 2 === 1);
  const column = (items: ProductCard[], drift: string, offset: string) => (
    <div className={cn("flex flex-col gap-4", offset)}>
      <div className={cn("flex flex-col gap-4", drift)}>
        {/* Doubled so the drift loops without a jump; the copy is hidden from screen readers and the tab order. */}
        {[...items, ...items].map((p, i) => (
          <Link
            key={`${p.id}-${i}`}
            href={`/resources/${p.slug}`}
            aria-hidden={i >= items.length || undefined}
            tabIndex={i >= items.length ? -1 : undefined}
            className="group block overflow-hidden rounded-[14px] bg-surface shadow-lg ring-1 ring-border transition hover:-translate-y-1 hover:shadow-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicObjectUrl("product-previews", p.preview_path!)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover object-top" />
            <span className="block truncate px-3 py-2 text-sm font-semibold group-hover:text-primary">{displayTitle(p)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
  return (
    <div className="cover-wall relative hidden overflow-hidden lg:block" aria-label="Popular resources">
      <div className="absolute inset-0 grid grid-cols-2 gap-4">
        {column(left, "cover-drift", "")}
        {column(right, "cover-drift-slow", "pt-24")}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      <span className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-sm font-bold text-white shadow-xl">
        <ShieldCheck className="size-4 text-accent" aria-hidden /> Every resource checked by GuroMart
      </span>
    </div>
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

/** Subjects keep recognizable icons within the same quiet brand palette. */
const SUBJECT_ICONS: Record<string, LucideIcon> = {
  english: BookOpen,
  filipino: Languages,
  mathematics: Calculator,
  science: FlaskConical,
  "araling-panlipunan": Landmark,
  gmrc: HeartHandshake,
  mapeh: Music,
  epp: Sprout,
  tle: Wrench,
  "mother-tongue": MessageCircle,
  "reading-literacy": BookOpenText,
  makabansa: Flag,
};

function gradeMark(code: string, name: string) {
  const n = Number(/^grade-(\d+)$/.exec(code)?.[1]);
  return n ? String(n) : name.charAt(0);
}

/** Only grades and subjects that have live resources, with how many. */
function GradesAndSubjects({ facets }: { facets: CatalogFacets }) {
  const grades = facets.grades.filter((g) => g.count > 0);
  const subjects = facets.subjects.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  if (!grades.length && !subjects.length) return null;
  const countLabel = (i: Facet) => (
    <span className="whitespace-nowrap text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
      <span data-testid="facet-count">{i.count}</span> {i.count === 1 ? "resource" : "resources"}
    </span>
  );
  return (
    <section aria-labelledby="grades-h" className="flex flex-col gap-6">
      <div data-guest-heading className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end sm:gap-4">
        <h2 id="grades-h" className="min-w-0 font-display text-[22px] font-extrabold leading-snug sm:text-[28px]">Available grades and subjects</h2>
        <Link href="/browse" className="flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline sm:text-sm">
          Browse all resources <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {grades.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">By grade</h3>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {grades.map((g) => {
              return (
                <li key={g.code} className="min-w-0">
                  <Link
                    href={`/browse?grade=${g.code}`}
                    className="guest-facet-card group flex h-full min-w-0 flex-col items-start gap-2 rounded-[14px] border border-border bg-surface p-3 transition-colors hover:border-primary/50 hover:bg-surface-muted sm:flex-row sm:items-center sm:gap-2.5"
                  >
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary-soft font-display text-base font-bold text-primary sm:size-9 sm:text-lg">
                      {gradeMark(g.code, g.name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="guest-facet-label text-sm font-semibold leading-snug [overflow-wrap:anywhere] group-hover:text-primary">{g.name}</span>
                      {countLabel(g)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {subjects.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">By subject</h3>
          <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {subjects.map((s) => {
              const Icon = SUBJECT_ICONS[s.code] ?? GraduationCap;
              return (
                <li key={s.code} className="min-w-0">
                  <Link
                    href={`/browse?subject=${s.code}`}
                    className="guest-facet-card group flex h-full min-w-0 flex-col items-start gap-2 rounded-[14px] border border-border bg-surface p-3 transition-colors hover:border-primary/50 hover:bg-surface-muted sm:flex-row sm:items-center sm:gap-2.5"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary-soft text-primary sm:size-9">
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="guest-facet-label text-sm font-semibold leading-snug [overflow-wrap:anywhere] group-hover:text-primary">{s.name}</span>
                      {countLabel(s)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
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
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div data-guest-heading className="flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0 flex-[1_1_220px]">
          <h2 id={id} className="font-display text-[22px] font-extrabold leading-snug sm:text-[28px]">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{criteria}</p>
        </div>
        <Link href={href} className="flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline sm:text-sm">
          See all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {/* Four on phones keeps each shelf to two rows; See all has the rest. */}
      <ProductGrid products={products.slice(0, 8 - bundles.length)} bundles={bundles} className="guest-resource-grid max-md:[&>li:nth-child(n+5)]:hidden" />
    </section>
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
    <section aria-labelledby="how-h" className="bg-foreground text-white">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-accent">For teachers</p>
          <h2 id="how-h" className="mt-2 font-display text-[22px] font-extrabold leading-snug sm:text-[32px]">How GuroMart works</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-white/10 font-display text-lg font-bold text-white">{i + 1}</span>
                <s.icon className="size-6 text-white/70" aria-hidden />
              </span>
              <h3 className="font-display text-lg font-bold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-white/75">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
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
    <section aria-labelledby="shops-h" className="flex flex-col gap-5">
      <h2 id="shops-h" className="font-display text-[22px] font-extrabold leading-snug sm:text-[28px]">Teacher shops</h2>
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
    <section className="relative overflow-hidden rounded-[24px] bg-primary p-6 text-white sm:p-12">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/5" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-48 rounded-full bg-white/10" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-accent">For teachers who create</p>
          <h2 className="mt-2 font-display text-[24px] font-extrabold leading-snug sm:text-[32px]">Sell what you already make for your class</h2>
          <ul className="mt-5 flex flex-col gap-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm font-medium leading-relaxed sm:text-base">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex lg:justify-end">
          <Link href="/sell" className={buttonVariants({ variant: "accent", size: "lg", className: "h-12 max-w-full rounded-full px-6 text-sm sm:h-14 sm:px-8 sm:text-base" })}>
            Start selling <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
