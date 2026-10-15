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

/** Below this many live resources, a one-line note says the catalog is new, and extra shelves would only repeat the featured ones. */
const LAUNCH_THRESHOLD = 8;

const count = new Intl.NumberFormat("en-PH");

export default function HomePage() {
  return (
    <>
      {/* Hero: light, like paper on a teacher's desk, with real covers drifting past on the right. */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-accent-soft" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-96 rounded-full bg-primary-soft" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch lg:pb-0 lg:pt-0">
          <div className="flex flex-col gap-6 lg:py-16">
            <p className="w-fit rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-white">
              Para sa mga guro, gawa ng mga guro
            </p>
            <h1 className="font-display text-[40px] font-extrabold leading-[1.02] tracking-tight text-foreground sm:text-6xl">
              Everything you need to{" "}
              <span className="relative whitespace-nowrap">
                <span aria-hidden className="absolute inset-x-[-4px] bottom-1 -z-0 h-[0.38em] -rotate-1 rounded-sm bg-accent" />
                <span className="relative">teach</span>
              </span>
              , all in one place.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
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
    </>
  );
}

async function QuickCategories() {
  const { categories } = await getTaxonomy();
  const picks = ["daily-lesson-log", "lesson-plan", "worksheet", "assessment", "presentation"];
  const chip = "block rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary";
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
        <Link href="/browse?price=free" className="block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent/90">
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
    <ul className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-5 text-sm text-muted-foreground" data-testid="hero-counts">
      {items.map((i) => (
        <li key={i.label} className="flex flex-col">
          <span className="font-display text-3xl font-extrabold text-primary">{count.format(i.value)}</span> {i.label}
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

/** Each subject's icon and color, so the subject tiles read at a glance. */
const SUBJECT_LOOK: Record<string, { icon: LucideIcon; tone: string }> = {
  english: { icon: BookOpen, tone: "bg-sky-100 text-sky-800" },
  filipino: { icon: Languages, tone: "bg-rose-100 text-rose-800" },
  mathematics: { icon: Calculator, tone: "bg-indigo-100 text-indigo-800" },
  science: { icon: FlaskConical, tone: "bg-emerald-100 text-emerald-800" },
  "araling-panlipunan": { icon: Landmark, tone: "bg-amber-100 text-amber-900" },
  gmrc: { icon: HeartHandshake, tone: "bg-pink-100 text-pink-800" },
  mapeh: { icon: Music, tone: "bg-violet-100 text-violet-800" },
  epp: { icon: Sprout, tone: "bg-lime-100 text-lime-900" },
  tle: { icon: Wrench, tone: "bg-orange-100 text-orange-900" },
  "mother-tongue": { icon: MessageCircle, tone: "bg-teal-100 text-teal-800" },
  "reading-literacy": { icon: BookOpenText, tone: "bg-cyan-100 text-cyan-800" },
  makabansa: { icon: Flag, tone: "bg-red-100 text-red-800" },
};
const SUBJECT_DEFAULT = { icon: GraduationCap, tone: "bg-slate-100 text-slate-800" };

/** A grade's tile color by school stage, and the big mark shown on it. */
function gradeLook(code: string, name: string) {
  const n = Number(/^grade-(\d+)$/.exec(code)?.[1]);
  const mark = n ? String(n) : name.charAt(0);
  if (!n) return { mark, tone: "bg-pink-500" };
  if (n <= 6) return { mark, tone: "bg-primary" };
  if (n <= 10) return { mark, tone: "bg-emerald-600" };
  return { mark, tone: "bg-violet-600" };
}

/** Only grades and subjects that have live resources, with how many. */
function GradesAndSubjects({ facets }: { facets: CatalogFacets }) {
  const grades = facets.grades.filter((g) => g.count > 0);
  const subjects = facets.subjects.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  if (!grades.length && !subjects.length) return null;
  const countLabel = (i: Facet) => (
    <span className="text-sm text-muted-foreground">
      <span data-testid="facet-count">{i.count}</span> {i.count === 1 ? "resource" : "resources"}
    </span>
  );
  return (
    <section aria-labelledby="grades-h" className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <h2 id="grades-h" className="font-display text-3xl font-extrabold">Available grades and subjects</h2>
        <Link href="/browse" className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Browse all resources <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {grades.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">By grade</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {grades.map((g) => {
              const look = gradeLook(g.code, g.name);
              return (
                <li key={g.code}>
                  <Link
                    href={`/browse?grade=${g.code}`}
                    className="group flex h-full items-center gap-3 rounded-[16px] border border-border bg-surface p-3 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                  >
                    <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-[12px] font-display text-2xl font-extrabold text-white", look.tone)}>
                      {look.mark}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-bold group-hover:text-primary">{g.name}</span>
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
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {subjects.map((s) => {
              const look = SUBJECT_LOOK[s.code] ?? SUBJECT_DEFAULT;
              return (
                <li key={s.code}>
                  <Link
                    href={`/browse?subject=${s.code}`}
                    className="group flex h-full items-center gap-3 rounded-[16px] border border-border bg-surface p-3 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                  >
                    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-[12px]", look.tone)}>
                      <look.icon className="size-6" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-bold group-hover:text-primary">{s.name}</span>
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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="font-display text-3xl font-extrabold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{criteria}</p>
        </div>
        <Link href={href} className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          See all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {/* Four on phones keeps each shelf to two rows; See all has the rest. */}
      <ProductGrid products={products.slice(0, 8 - bundles.length)} bundles={bundles} className="max-md:[&>li:nth-child(n+5)]:hidden" />
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
          <h2 id="how-h" className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">How GuroMart works</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3">
              <span className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-accent font-display text-xl font-extrabold text-foreground">{i + 1}</span>
                <s.icon className="size-6 text-white/70" aria-hidden />
              </span>
              <h3 className="font-display text-xl font-bold">{s.title}</h3>
              <p className="text-sm text-white/75">{s.text}</p>
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
      <h2 id="shops-h" className="font-display text-3xl font-extrabold">Teacher shops</h2>
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
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-accent/90" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-48 rounded-full bg-white/10" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-accent">For teachers who create</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Sell what you already make for your class</h2>
          <ul className="mt-5 flex flex-col gap-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 font-medium">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex lg:justify-end">
          <Link href="/sell" className={buttonVariants({ variant: "accent", size: "lg", className: "h-14 rounded-full px-8 text-lg" })}>
            Start selling <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
