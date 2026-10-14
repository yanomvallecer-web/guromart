import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CalendarDays,
  CircleHelp,
  Download,
  FilePlus2,
  FileText,
  House,
  Layers,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  MessageCircle,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { ProductCard as ResourceCard } from "@/components/catalog/product-card";
import { SearchForm } from "@/components/site/search-form";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { firstName, greeting } from "@/lib/account/greeting";
import { getQuarterCoverage } from "@/lib/account/home";
import { getTeachingPreferences } from "@/lib/account/preferences";
import { type Viewer, requireViewer } from "@/lib/auth/dal";
import { shopSummary } from "@/lib/catalog/labels";
import { browseProducts, countProducts, getCatalogFacets, getFeaturedStorefronts, getShelf, getTaxonomy } from "@/lib/catalog/queries";
import type { BrowseParams } from "@/lib/catalog/search-params";
import { getLibrary, getLibraryDetails } from "@/lib/commerce/cart";
import { getEarnings } from "@/lib/commerce/earnings";
import { formatAmount } from "@/lib/format";
import { getSellerPlans } from "@/lib/platform-settings";
import { publicObjectUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

// Signed-in teachers reach this page at "/": the proxy shows it in place of the landing page.

const CODE = /^[a-z0-9-]{1,60}$/;
/** In a home filter, "any" means the teacher removed their saved grade or subject. */
const ANY = "any";
const count = new Intl.NumberFormat("en-PH");
const dateFmt = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" });

type Raw = Awaited<PageProps<"/home">["searchParams"]>;

export default function TeacherHomePage({ searchParams }: PageProps<"/home">) {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-10 pt-6 sm:px-6 xl:grid-cols-[208px_minmax(0,1fr)]">
      <Suspense fallback={<div className="hidden xl:block" />}>
        <Sidebar />
      </Suspense>
      <Suspense fallback={<HomeSkeleton />}>
        <Home searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-52 w-full rounded-[20px]" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Sidebar (large screens; phones use the tab bar and the header menu)      */
/* ------------------------------------------------------------------------ */

type NavItem = { href: string; label: string; icon: LucideIcon; current?: boolean };

async function Sidebar() {
  const viewer = await requireViewer("/");
  const seller = viewer.roles.includes("seller");
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "My teaching",
      items: [
        { href: "/", label: "Home", icon: House, current: true },
        { href: "/library", label: "My library", icon: BookOpen },
        { href: "/library?tab=saved", label: "Saved", icon: Bookmark },
        { href: "/browse", label: "Browse", icon: LayoutGrid },
        { href: "/bundles", label: "Lesson bundles", icon: Layers },
        { href: "/cart", label: "Cart", icon: ShoppingCart },
        { href: "/orders", label: "Orders", icon: Receipt },
      ],
    },
    {
      label: "My shop",
      items: seller
        ? [
            { href: "/seller", label: "Seller dashboard", icon: Store },
            { href: "/seller/products/new", label: "Add a resource", icon: FilePlus2 },
            { href: "/seller/earnings", label: "Earnings", icon: Wallet },
          ]
        : [{ href: "/sell", label: "Start selling", icon: Store }],
    },
    {
      label: "Others",
      items: [
        { href: "/messages", label: "Messages", icon: MessageCircle },
        { href: "/help", label: "Ask GuroMart", icon: CircleHelp },
        { href: "/account", label: "My account", icon: UserRound },
        ...(viewer.roles.includes("admin") ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
      ],
    },
  ];
  return (
    <aside className="hidden xl:block">
      <nav aria-label="Your GuroMart" className="sticky top-24 flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{g.label}</p>
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={i.current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold",
                  i.current ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                <i.icon className="size-5 shrink-0" aria-hidden />
                {i.label}
              </Link>
            ))}
          </div>
        ))}
        <form action={signOut}>
          <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold text-muted-foreground hover:bg-surface hover:text-foreground">
            <LogOut className="size-5 shrink-0" aria-hidden /> Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}

/* ------------------------------------------------------------------------ */
/* Main                                                                     */
/* ------------------------------------------------------------------------ */

async function Home({ searchParams }: { searchParams: PageProps<"/home">["searchParams"] }) {
  const viewer = await requireViewer("/");
  const [raw, prefs, taxonomy] = await Promise.all([searchParams, getTeachingPreferences(), getTaxonomy()]);

  // The class filter starts from what the teacher said they teach; the URL can change it for this visit.
  const pick = (v: Raw[string], saved: string | null) => {
    const s = typeof v === "string" && CODE.test(v) ? v : undefined;
    if (s === ANY) return null;
    return s ?? saved;
  };
  const filter = {
    grade: pick(raw.grade, prefs?.grade?.code ?? null),
    subject: pick(raw.subject, prefs?.subject?.code ?? null),
    free: raw.price === "free",
  };
  const quarters = taxonomy.periods.filter((p) => /^quarter-\d$/.test(p.code));

  return (
    // Phones get one column in a set order; large screens put the planning cards in a right column.
    <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-8">
        <header className="order-1">
          <h1 className="font-display text-[28px] font-extrabold leading-tight sm:text-[32px]">
            {greeting()}, {firstName(viewer.displayName)}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {prefs ? (
              <>
                {[prefs.grade?.name, prefs.subject?.name].filter(Boolean).join(" · ")}{" "}
                <Link href="/account" className="font-semibold text-primary hover:underline">Change</Link>
              </>
            ) : (
              <>
                Tell us what you teach and this page fills with lessons for your class.{" "}
                <Link href="/account" className="font-semibold text-primary hover:underline">Set your grade and subject</Link>
              </>
            )}
          </p>
        </header>
        <Suspense fallback={<Skeleton className="order-2 h-52 w-full rounded-[20px]" />}>
          <Hero filter={filter} />
        </Suspense>
        <Suspense fallback={<Skeleton className="order-4 h-80 w-full" />}>
          <ForYourClass filter={filter} taxonomy={taxonomy} />
        </Suspense>
        <Suspense fallback={null}>
          <Shops />
        </Suspense>
      </div>
      <div className="contents lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-6">
        <Suspense fallback={<Skeleton className="order-3 h-64 w-full" />}>
          <QuarterPlan teach={{ grade: prefs?.grade?.code ?? null, subject: prefs?.subject?.code ?? null, free: false }} quarters={quarters} />
        </Suspense>
        <Suspense fallback={<Skeleton className="order-5 h-64 w-full" />}>
          <PickUp />
        </Suspense>
        <Suspense fallback={null}>
          <ShopCard viewer={viewer} />
        </Suspense>
      </div>
    </div>
  );
}

type Filter = { grade: string | null; subject: string | null; free: boolean };

const browseFor = (f: Filter): BrowseParams => ({
  grade: f.grade ?? undefined,
  subject: f.subject ?? undefined,
  price: f.free ? "free" : undefined,
  sort: "popular",
});

/** /browse with the same filters, for "See all". */
function browseHref(f: Filter, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams();
  if (f.grade) qs.set("grade", f.grade);
  if (f.subject) qs.set("subject", f.subject);
  if (f.free) qs.set("price", "free");
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  if (!f.grade && !f.subject) qs.set("all", "1");
  return `/browse?${qs}`;
}

/** This page with one filter changed. Removing a saved grade or subject writes "any". */
function homeHref(f: Filter, change: Partial<Filter>) {
  const next = { ...f, ...change };
  const qs = new URLSearchParams();
  qs.set("grade", next.grade ?? ANY);
  qs.set("subject", next.subject ?? ANY);
  if (next.free) qs.set("price", "free");
  return `/?${qs}`;
}

/** Search first, on a warm card, with three real covers peeking in on wider screens. */
async function Hero({ filter }: { filter: Filter }) {
  const forClass = (await browseProducts(browseFor(filter))).items;
  const covers = [...forClass, ...(await getShelf("popular", 12))]
    .filter((p, i, all) => p.preview_path && all.findIndex((q) => q.id === p.id) === i)
    .slice(0, 3);
  return (
    <section aria-label="Search" className="relative order-2 overflow-hidden rounded-[20px] bg-gradient-to-br from-accent-soft via-[#fbe7b0] to-[#f8dc93] p-5 sm:p-8">
      <div className="relative z-10 flex max-w-[420px] flex-col gap-3">
        <h2 className="font-display text-[26px] font-extrabold leading-[1.08] sm:text-4xl">
          Find your next lesson,{" "}
          <span className="relative whitespace-nowrap">
            <span aria-hidden className="absolute inset-x-[-3px] bottom-1 h-[0.32em] rounded-sm bg-white/80" />
            <span className="relative">ready to teach</span>
          </span>
        </h2>
        <p className="text-[15px] text-foreground/75">DLLs, lesson plans, slides and worksheets made by Filipino teachers.</p>
        {/* Phones already have the search field in the header. */}
        <Link href={browseHref(filter)} className={cn(buttonVariants(), "mt-1 w-fit md:hidden")}>
          <SlidersHorizontal aria-hidden /> Browse with filters
        </Link>
        <div className="mt-1 hidden gap-2 md:flex">
          <SearchForm size="lg" className="flex-1 border-0 shadow-lg shadow-foreground/5" placeholder='Try "Grade 5 Science Quarter 2"' />
          <Link
            href={browseHref(filter)}
            aria-label="More filters"
            title="More filters"
            className="flex size-14 shrink-0 items-center justify-center rounded-[12px] bg-foreground text-white hover:bg-foreground/90"
          >
            <SlidersHorizontal className="size-5" aria-hidden />
          </Link>
        </div>
      </div>
      {covers.length === 3 ? (
        <div aria-hidden className="pointer-events-none absolute -bottom-8 right-6 hidden items-end min-[1400px]:flex">
          {covers.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={publicObjectUrl("product-previews", p.preview_path!)}
              alt=""
              className={cn(
                "rounded-[10px] bg-surface object-cover object-top shadow-xl ring-1 ring-black/5",
                i === 1 ? "z-10 h-40 w-28 -translate-y-3" : "h-32 w-24",
                i === 0 && "translate-x-4 -rotate-6",
                i === 2 && "-translate-x-4 rotate-6",
              )}
            />
          ))}
        </div>
      ) : null}
      <span className="absolute right-5 top-5 z-10 hidden items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-white lg:flex">
        <ShieldCheck className="size-4 text-accent" aria-hidden /> Every resource checked by GuroMart
      </span>
    </section>
  );
}

/** Popular resources for the teacher's grade and subject, with the filters shown as chips they can remove. */
async function ForYourClass({ filter, taxonomy }: { filter: Filter; taxonomy: Awaited<ReturnType<typeof getTaxonomy>> }) {
  const { items, total } = await browseProducts(browseFor(filter));
  const name = (list: { code: string; name: string }[], code: string | null) => list.find((i) => i.code === code)?.name ?? null;
  const grade = name(taxonomy.grades, filter.grade);
  const subject = name(taxonomy.subjects, filter.subject);
  const filtering = Boolean(filter.grade || filter.subject || filter.free);
  const shown = items.slice(0, 6);

  const chip = "flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold";
  const on = cn(chip, "bg-primary text-white hover:bg-primary-hover");
  const off = cn(chip, "border border-border bg-surface text-foreground hover:border-primary");

  return (
    <section aria-labelledby="class-h" className="order-4 flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="class-h" className="font-display text-2xl font-extrabold">{grade || subject ? "For your class" : "Popular with teachers"}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total ? `${count.format(total)} ${total === 1 ? "resource matches" : "resources match"}, most bought and downloaded first.` : "Nothing matches these filters yet."}
          </p>
        </div>
        <Link href={browseHref(filter)} className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          See all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <nav aria-label="Filters for your class" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex items-center gap-2">
          {grade ? (
            <li>
              <Link href={homeHref(filter, { grade: null })} className={on} aria-label={`Remove filter: ${grade}`}>
                {grade} <X className="size-4" aria-hidden />
              </Link>
            </li>
          ) : (
            <li>
              <Link href={browseHref(filter)} className={off}>Any grade</Link>
            </li>
          )}
          {subject ? (
            <li>
              <Link href={homeHref(filter, { subject: null })} className={on} aria-label={`Remove filter: ${subject}`}>
                {subject} <X className="size-4" aria-hidden />
              </Link>
            </li>
          ) : (
            <li>
              <Link href={browseHref(filter)} className={off}>Any subject</Link>
            </li>
          )}
          <li>
            <Link
              href={homeHref(filter, { free: !filter.free })}
              aria-pressed={filter.free}
              className={filter.free ? on : cn(chip, "border border-[#f2d77f] bg-accent-soft text-foreground hover:border-accent")}
            >
              Free only {filter.free ? <X className="size-4" aria-hidden /> : null}
            </Link>
          </li>
          {filtering ? (
            <li className="sm:ml-auto">
              <Link href={homeHref(filter, { grade: null, subject: null, free: false })} className="flex min-h-10 items-center whitespace-nowrap px-2 text-sm font-semibold text-primary hover:underline">
                Clear filters
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>

      {shown.length ? (
        // A swipeable row on phones, a grid from small tablets up.
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 sm:overflow-visible sm:px-0">
          {shown.map((p) => (
            <li key={p.id} className="w-[160px] shrink-0 snap-start sm:w-auto sm:min-w-0">
              <ResourceCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[16px] border border-dashed border-border bg-surface p-6 text-center">
          <p className="font-semibold">No resources for this class yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">New ones appear as teachers publish them.</p>
          <Link href={homeHref(filter, { grade: null, subject: null, free: false })} className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
            Show everything popular
          </Link>
        </div>
      )}
    </section>
  );
}

/** Shops with live resources, most resources first, with real follower counts. */
async function Shops() {
  const [stores, facets] = await Promise.all([getFeaturedStorefronts(24), getCatalogFacets()]);
  const live = stores
    .filter((s) => facets.shops[s.slug])
    .sort((a, b) => facets.shops[b.slug].count - facets.shops[a.slug].count)
    .slice(0, 4);
  if (live.length === 0) return null;
  const supabase = await createClient();
  const { data: ids } = await supabase.from("storefronts").select("id, slug").in("slug", live.map((s) => s.slug));
  const followers = new Map(
    await Promise.all(
      (ids ?? []).map(async (s) => {
        const { data } = await supabase.rpc("shop_follower_count", { p_storefront_id: s.id });
        return [s.slug, typeof data === "number" ? data : 0] as const;
      }),
    ),
  );
  const tones = ["bg-success", "bg-violet-600", "bg-orange-600", "bg-primary"];
  return (
    <section aria-labelledby="shops-h" className="order-6 flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="shops-h" className="font-display text-2xl font-extrabold">Teacher shops</h2>
        <Link href="/browse" className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Browse all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {live.map((s, i) => {
          const n = followers.get(s.slug) ?? 0;
          return (
            <li key={s.slug} className="w-[260px] shrink-0 snap-start sm:w-auto">
              <Link href={`/shop/${s.slug}`} className="group flex h-full items-center gap-3 rounded-[16px] border border-border bg-surface p-4 hover:border-primary hover:shadow-md">
                {s.logo_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicObjectUrl("storefront-media", s.logo_path)} alt="" className="size-12 shrink-0 rounded-[12px] object-cover" />
                ) : (
                  <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-[12px] font-display text-xl font-extrabold text-white", tones[i % tones.length])}>
                    {initial(s.name)}
                  </span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-bold group-hover:text-primary">{s.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{shopSummary(facets.shops[s.slug])}</span>
                  {n > 0 ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3.5" aria-hidden /> {count.format(n)} {n === 1 ? "follower" : "followers"}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Right column                                                             */
/* ------------------------------------------------------------------------ */

/** A shop's first letter, skipping a "[Demo]" label or punctuation. */
function initial(name: string) {
  return (name.replace(/^\[Demo\]\s*/i, "").match(/[\p{L}\p{N}]/u)?.[0] ?? "S").toUpperCase();
}

/** Pesos without ".00" when the amount is whole, as teachers write them. */
const pesos = (centavos: number) => formatAmount(centavos).replace(/\.00$/, "");

const panel = "rounded-[18px] border border-border bg-surface p-4 sm:p-5";

/**
 * The quarters for the grade and subject the teacher saved: which ones already have
 * resources in their library, and a way to fill the first empty one.
 */
async function QuarterPlan({ teach: filter, quarters }: { teach: Filter; quarters: { code: string; name: string }[] }) {
  if (!filter.grade && !filter.subject) {
    return (
      <section aria-labelledby="plan-h" className={cn(panel, "order-3")}>
        <div className="rounded-[14px] bg-primary p-4 text-white">
          <CalendarDays className="size-6 text-accent" aria-hidden />
          <h2 id="plan-h" className="mt-2 font-display text-lg font-bold">Plan your quarters</h2>
          <p className="mt-1 text-sm text-white/85">Tell us the grade and subject you teach. We&apos;ll show which quarters your library already covers and find lessons for the rest.</p>
        </div>
        <Link href="/account" className={cn(buttonVariants(), "mt-3 w-full")}>Set what I teach</Link>
      </section>
    );
  }
  const library = await getLibrary();
  const [coverage, taxonomy] = await Promise.all([getQuarterCoverage(library.map((i) => i.product_id), quarters, filter), getTaxonomy()]);
  const covered = coverage.filter((q) => q.owned > 0).length;
  const gap = coverage.find((q) => q.owned === 0);
  const matches = gap ? await countProducts({ grade: filter.grade ?? undefined, subject: filter.subject ?? undefined, period: gap.code }) : 0;
  const label = [taxonomy.grades.find((g) => g.code === filter.grade)?.name, taxonomy.subjects.find((s) => s.code === filter.subject)?.name].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="plan-h" className={cn(panel, "order-3")}>
      <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-primary to-[#2f6fc4] p-4 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-white/10" />
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/80">Your quarter plan</p>
        <h2 id="plan-h" className="mt-1 font-display text-lg font-bold">{label}</h2>
        <p className="mt-2 font-display text-4xl font-extrabold leading-none">
          {covered} <span className="text-base font-semibold text-white/85">of {coverage.length} quarters have lessons</span>
        </p>
        <ol className="mt-4 grid grid-cols-4 gap-2">
          {coverage.map((q) => (
            <li key={q.code}>
              <Link
                href={browseHref(filter, { period: q.code })}
                className={cn(
                  "flex flex-col items-center rounded-[10px] px-1 py-2 text-center",
                  q.owned ? "bg-accent text-foreground" : "bg-white/15 text-white hover:bg-white/25",
                )}
              >
                <span className="font-display text-base font-extrabold">Q{q.sequence}</span>
                <span className="text-[11px] font-semibold">{q.owned ? `${q.owned} owned` : "None yet"}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
      {gap ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-accent-soft p-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">{gap.name} has nothing yet</p>
            <p className="text-xs text-muted-foreground">
              {matches ? `${count.format(matches)} ${matches === 1 ? "resource matches" : "resources match"}` : "None for your grade yet. See every grade."}
            </p>
          </div>
          {/* With nothing for this grade yet, the button widens the search to every grade. */}
          <Link href={browseHref(matches ? filter : { ...filter, grade: null }, { period: gap.code })} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-foreground hover:bg-accent/90">
            Find lessons
          </Link>
        </div>
      ) : (
        <p className="mt-3 rounded-[12px] bg-success-soft p-3 text-sm font-semibold text-success">All four quarters have lessons in your library.</p>
      )}
    </section>
  );
}

/** The newest things in the teacher's library, ready to download again. */
async function PickUp() {
  const items = (await getLibrary()).slice(0, 3);
  const details = await getLibraryDetails(items.map((i) => i.product_id));
  return (
    <section aria-labelledby="pickup-h" className={cn(panel, "order-5")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="pickup-h" className="font-display text-lg font-bold">Pick up where you left off</h2>
        <Link href="/library" className="shrink-0 text-sm font-semibold text-primary hover:underline">My library</Link>
      </div>
      {items.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">Resources you get or buy show up here, ready to download.</p>
          <Link href="/browse?price=free" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 h-11")}>Find free resources</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => {
            const d = details.get(item.product_id);
            const files = item.files.filter((f) => f.available);
            const meta = [d?.grades.map((g) => g.name).join(", "), d?.period?.name].filter(Boolean).join(" · ");
            return (
              <li key={item.entitlement_id} className="flex items-center gap-3 rounded-[12px] border border-border p-2.5">
                <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-primary-soft text-primary/60">
                  {d?.previewPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={publicObjectUrl("product-previews", d.previewPath)} alt="" loading="lazy" className="size-full bg-surface object-cover object-top" />
                  ) : (
                    <FileText className="size-5" aria-hidden />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  {item.is_live ? (
                    <Link href={`/resources/${item.slug}`} className="line-clamp-2 text-sm font-bold leading-snug hover:text-primary">{item.title}</Link>
                  ) : (
                    <span className="line-clamp-2 text-sm font-bold leading-snug">{item.title}</span>
                  )}
                  <span className="truncate text-xs text-muted-foreground">{meta || item.shop_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.source === "purchase" ? "Bought" : item.source === "free" ? "Free" : "Given"} {dateFmt.format(new Date(item.granted_at))}
                  </span>
                </span>
                {files.length === 1 ? (
                  // A plain link: the route checks access, logs the download and redirects to a short-lived file link.
                  <a href={`/library/download/${files[0].id}`} aria-label={`Download ${item.title}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-primary hover:border-primary">
                    <Download className="size-5" aria-hidden />
                  </a>
                ) : (
                  <Link href="/library" aria-label={`Open ${item.title} in My library`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-primary hover:border-primary">
                    <Download className="size-5" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Sellers see how close they are to a payout; everyone else, a short pitch to start selling. */
async function ShopCard({ viewer }: { viewer: Viewer }) {
  const plans = await getSellerPlans();
  const min = plans.minPayoutCentavos;
  const keep = 100 - plans.starterBps / 100;
  if (!viewer.roles.includes("seller")) {
    return (
      <section aria-labelledby="sell-h" className={cn(panel, "order-7 bg-primary text-white")}>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-accent">For teachers who create</p>
        <h2 id="sell-h" className="mt-1 font-display text-lg font-bold">Sell what you already make</h2>
        <p className="mt-1 text-sm text-white/85">
          Free to open a shop. You keep {keep}% of each sale, paid to GCash, Maya or your bank from {pesos(min)}.
        </p>
        <Link href="/sell" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-accent px-5 text-sm font-bold text-foreground hover:bg-accent/90">
          Start selling <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
  const supabase = await createClient();
  const { data: account } = await supabase.from("seller_accounts").select("id").eq("user_id", viewer.id).maybeSingle();
  if (!account) return null;
  const e = await getEarnings(account.id);
  const pct = min > 0 ? Math.min(100, Math.round((e.availableCentavos / min) * 100)) : 100;
  const ready = e.availableCentavos >= min;
  return (
    <section aria-labelledby="shop-h" className={cn(panel, "order-7")}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="shop-h" className="font-display text-lg font-bold">Your shop</h2>
        <Link href="/seller" className="text-sm font-semibold text-primary hover:underline">Dashboard</Link>
      </div>
      <p className="mt-2 font-display text-[28px] font-extrabold leading-none">
        {pesos(e.availableCentavos)}{" "}
        <span className="font-sans text-sm font-semibold text-muted-foreground">{ready ? "ready for payout" : `of ${pesos(min)} to your next payout`}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Progress to your next payout"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-primary-soft"
      >
        <div className={cn("h-full rounded-full", ready ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {ready
          ? "You can ask for a payout from Earnings."
          : `${pesos(min - e.availableCentavos)} more and you can ask for a payout.`}
        {e.pendingCentavos > 0 ? ` ${pesos(e.pendingCentavos)} more is on hold for ${plans.holdDays} days after each sale.` : ""}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[10px] border border-border bg-surface-muted p-2.5">
          <dt className="text-xs text-muted-foreground">Sales</dt>
          <dd className="text-lg font-bold">{count.format(e.salesCount)}</dd>
        </div>
        <div className="rounded-[10px] border border-border bg-surface-muted p-2.5">
          <dt className="text-xs text-muted-foreground">Earned so far</dt>
          <dd className="text-lg font-bold">{pesos(e.lifetimeCentavos)}</dd>
        </div>
      </dl>
    </section>
  );
}
