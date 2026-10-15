import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Bell,
  CalendarDays,
  ClipboardCheck,
  ChevronDown,
  Download,
  FilePlus2,
  FileText,
  FilePenLine,
  House,
  Layers,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  MessageCircle,
  NotebookPen,
  Receipt,
  Presentation,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { FollowButton } from "@/components/catalog/follow-button";
import { ProductCard as ResourceCard } from "@/components/catalog/product-card";
import { AccountMenu, AccountMenuFallback } from "@/components/site/account-menu";
import { Logo } from "@/components/site/logo";
import { TeacherPhoneHeader } from "@/components/site/teacher-phone-header";
import { ResourceCategoryLink } from "@/components/site/resource-category-link";
import { MenuDetails } from "@/components/site/menu-details";
import { HomeDiscovery } from "@/components/catalog/home-discovery";
import { SaveButton } from "@/components/catalog/save-button";
import { displayTitle } from "@/lib/catalog/labels";
import "./teacher-home.css";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { firstName, greeting } from "@/lib/account/greeting";
import { getUnreadCount } from "@/lib/account/notifications";
import { getPeriodCoverage } from "@/lib/account/home";
import { getTeachingPreferences } from "@/lib/account/preferences";
import { type Viewer, requireViewer } from "@/lib/auth/dal";
import { shopSummary } from "@/lib/catalog/labels";
import { browseProducts, countProducts, getCatalogFacets, getFeaturedStorefronts, getShelf, getTaxonomy } from "@/lib/catalog/queries";
import type { BrowseParams } from "@/lib/catalog/search-params";
import { getCartCount, getLibrary, getLibraryDetails } from "@/lib/commerce/cart";
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
    // data-app-shell: on wide screens this page brings its own side menu and top bar, so the site header and floating Ask GuroMart button step aside.
    <div data-app-shell data-teacher-home className="xl:min-h-dvh">
      <div className="hidden border-r border-border bg-surface xl:block">
        <Suspense>
          <Sidebar />
        </Suspense>
      </div>
      <div className="min-w-0">
        <TeacherPhoneHeader greeting={<PhoneGreeting />} initial={<PhoneInitial />} />
        <Suspense fallback={<HomeSkeleton />}>
          <Home searchParams={searchParams} />
        </Suspense>
      </div>
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

async function PhoneGreeting() {
  const viewer = await requireViewer("/");
  return `${greeting()}, ${firstName(viewer.displayName)}`;
}

async function PhoneInitial() {
  const viewer = await requireViewer("/");
  return viewer.displayName.slice(0, 1).toUpperCase();
}

/* ------------------------------------------------------------------------ */
/* Sidebar (large screens; phones use the tab bar and the header menu)      */
/* ------------------------------------------------------------------------ */

type NavItem = { href: string; label: string; icon: LucideIcon; current?: boolean; badge?: number };

async function Sidebar() {
  const viewer = await requireViewer("/");
  const seller = viewer.roles.includes("seller");
  const cartCount = await getCartCount(viewer);
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "My teaching",
      items: [
        { href: "/", label: "Home", icon: House, current: true },
        { href: "/library", label: "My library", icon: BookOpen },
        { href: "/library?tab=saved", label: "Saved", icon: Bookmark },
        { href: "/browse", label: "Browse", icon: LayoutGrid },
        { href: "/bundles", label: "Lesson bundles", icon: Layers },
        { href: "/cart", label: "Cart", icon: ShoppingCart, badge: cartCount || undefined },
        { href: "/orders", label: "Orders", icon: Receipt },
        { href: "/messages", label: "Messages", icon: MessageCircle },
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
  ];
  const others: NavItem[] = [
    { href: "/account", label: "Settings", icon: Settings },
    ...(viewer.roles.includes("admin") ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  const link = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={i.current ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[13px] leading-5",
        i.current ? "bg-primary-soft font-bold text-primary" : "font-[550] text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <i.icon className="size-5 shrink-0" aria-hidden />
      <span className="flex-1 whitespace-nowrap">{i.label}</span>
      {i.badge ? <span className="rounded-full bg-accent px-2 text-xs font-bold text-foreground">{i.badge}</span> : null}
    </Link>
  );
  return (
    <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-5 py-6 font-sans">
      <div className="px-2">
        <Logo />
      </div>
      <nav aria-label="Your GuroMart" className="flex flex-1 flex-col gap-5">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{g.label}</p>
            {g.items.map(link)}
          </div>
        ))}
        <div className="mt-auto flex flex-col gap-1">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Others</p>
          {others.map(link)}
          <form action={signOut}>
            <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[13px] font-[550] leading-5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
              <LogOut className="size-5 shrink-0" aria-hidden /> Log out
            </button>
          </form>
        </div>
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
    type: pick(raw.type, null),
    plan: raw.plan === "terms" || raw.plan === "quarters" ? (raw.plan as Calendar) : null,
  };
  const calendars = {
    quarters: taxonomy.periods.filter((p) => /^quarter-\d$/.test(p.code)),
    // Stored as trimesters; schools call them terms.
    terms: taxonomy.periods.filter((p) => /^trimester-\d$/.test(p.code)).map((p, i) => ({ code: p.code, name: `Term ${i + 1}` })),
  };

  const hello = `${greeting()}, ${firstName(viewer.displayName)}`;
  const unread = await getUnreadCount(viewer.id);
  return (
    <div className="min-w-0">
      <header className="teacher-desktop-header hidden items-center gap-4 border-b border-border bg-surface px-7 py-4 xl:flex">
        <div className="min-w-0 flex-1"><h1 className="truncate font-display font-extrabold leading-tight">{hello}</h1><Teaching prefs={prefs} /></div>
        <Link href="/help" className="flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary"><MessageCircle className="size-4" aria-hidden /> Ask GuroMart</Link>
        <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative flex size-11 items-center justify-center rounded-full border border-border hover:border-primary"><Bell className="size-5" aria-hidden />{unread ? <span aria-hidden className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-surface bg-danger" /> : null}</Link>
        <Suspense fallback={<AccountMenuFallback />}><AccountMenu /></Suspense>
      </header>
      <div className="teacher-home-content">
        <div className="teacher-home-main">
          <Suspense fallback={<Skeleton className="hidden h-44 w-full rounded-[18px] md:block" />}><Hero filter={filter} /></Suspense>
          <HomeDiscovery key={homeHref(filter, {})} filters={Object.fromEntries(Object.entries({ grade: filter.grade, subject: filter.subject, category: filter.type, price: filter.free ? "free" : null }).filter((entry): entry is [string, string] => Boolean(entry[1])))}>
            <HomeFilters filter={filter} taxonomy={taxonomy} />
          </HomeDiscovery>
          <MobileCategories filter={filter} />
          <Suspense fallback={<Skeleton className="h-80 w-full" />}><ForYourClass filter={filter} taxonomy={taxonomy} viewer={viewer} /></Suspense>
          <div className="teacher-home-extras">
            <Suspense fallback={<Skeleton className="h-60" />}><SchoolYearPlan teach={{ grade: prefs?.grade?.code ?? null, subject: prefs?.subject?.code ?? null, free: false }} calendars={calendars} chosen={filter.plan ?? null} filter={filter} /></Suspense>
            <Suspense fallback={null}><ShopCard viewer={viewer} /></Suspense>
          </div>
          <div className="teacher-home-shops"><Suspense fallback={null}><Shops /></Suspense></div>
        </div>
        <aside className="teacher-home-rail" aria-label="Your teaching library"><Suspense fallback={<Skeleton className="h-64" />}><PickUp /></Suspense></aside>
      </div>
    </div>
  );
}

/** The grade and subject the teacher saved, with a link to change them. */
function Teaching({ prefs }: { prefs: Awaited<ReturnType<typeof getTeachingPreferences>> }) {
  return (
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
  );
}

type Filter = { grade: string | null; subject: string | null; free: boolean; type?: string | null; plan?: Calendar | null };
type Calendar = "quarters" | "terms";
type Period = { code: string; name: string };

const browseFor = (f: Filter): BrowseParams => ({
  grade: f.grade ?? undefined,
  subject: f.subject ?? undefined,
  price: f.free ? "free" : undefined,
  category: f.type ?? undefined,
  sort: "popular",
});

/** /browse with the same filters, for "See all". */
function browseHref(f: Filter, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams();
  if (f.grade) qs.set("grade", f.grade);
  if (f.subject) qs.set("subject", f.subject);
  if (f.free) qs.set("price", "free");
  if (f.type) qs.set("category", f.type);
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
  if (next.type) qs.set("type", next.type);
  if (next.plan) qs.set("plan", next.plan);
  return `/?${qs}`;
}

/** A compact introduction on desktop; phones begin directly with discovery. */
async function Hero({ filter }: { filter: Filter }) {
  const forClass = (await browseProducts(browseFor(filter))).items;
  const covers = [...forClass, ...(await getShelf("popular", 12))].filter((p, i, all) => p.preview_path && all.findIndex((q) => q.id === p.id) === i).slice(0, 3);
  return <>
    <section aria-label="Find lessons" className="teacher-hero">
      <div className="teacher-hero-copy"><p className="teacher-hero-eyebrow">PARA SA MGA GURO, GAWA NG MGA GURO</p><h2>Find your next lesson,<br /><span>ready to teach</span></h2><p>DLLs, lesson plans, slides and worksheets made by Filipino teachers.</p></div>
      {covers.length === 3 ? <div aria-hidden className="teacher-hero-covers">{covers.map(p => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.id} src={publicObjectUrl("product-previews", p.preview_path!)} alt="" />
      ))}</div> : null}
    </section>
    <p className="teacher-trust"><ShieldCheck aria-hidden /> Every resource checked by GuroMart</p>
  </>;
}

function MobileCategories({ filter }: { filter: Filter }) {
  const categories = [
    { label: "Presentations", type: "presentation", icon: Presentation, tone: "slides" },
    { label: "Lesson plans", type: "lesson-plan", icon: FileText, tone: "plans" },
    { label: "Printables", type: "printable", icon: CalendarDays, tone: "prints" },
    { label: "Free resources", type: null, icon: Download, tone: "free" },
    { label: "Worksheets", type: "worksheet", icon: FilePenLine, tone: "worksheets" },
    { label: "Daily lesson logs", type: "daily-lesson-log", icon: NotebookPen, tone: "logs" },
    { label: "Assessments", type: "assessment", icon: ClipboardCheck, tone: "assessments" },
  ];
  return <>
    <nav className="teacher-categories" aria-label="Resource categories" aria-describedby="resource-categories-hint" tabIndex={0}>
      {categories.map(c => <ResourceCategoryLink key={c.label} label={c.label} href={browseHref({ ...filter, type: c.type, free: c.type === null })}><span className={`teacher-category-circle teacher-category-${c.tone}`}><c.icon aria-hidden /></span>{c.label}</ResourceCategoryLink>)}
    </nav>
    <p id="resource-categories-hint" className="teacher-category-hint">Swipe for more <ArrowRight aria-hidden /></p>
  </>;
}

/** Popular resources for the teacher's grade and subject, with the filters shown as chips they can remove. */
async function ForYourClass({ filter, taxonomy, viewer }: { filter: Filter; taxonomy: Awaited<ReturnType<typeof getTaxonomy>>; viewer: Viewer }) {
  const { items, total } = await browseProducts(browseFor(filter));
  const name = (list: { code: string; name: string }[], code: string | null) => list.find((i) => i.code === code)?.name ?? null;
  const grade = name(taxonomy.grades, filter.grade);
  const subject = name(taxonomy.subjects, filter.subject);
  const shown = items.slice(0, 8);
  const supabase = await createClient();
  const { data: wishlist } = shown.length ? await supabase.from("wishlists").select("product_id").eq("user_id", viewer.id).in("product_id", shown.map(p => p.id)) : { data: [] };
  const saved = new Set((wishlist ?? []).map(p => p.product_id));

  return (
    <section aria-labelledby="class-h" className="teacher-resources">
      <div className="teacher-resource-heading flex items-end justify-between gap-4">
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



      {shown.length ? (
        <ul className="teacher-resource-grid">
          {shown.map((p) => (
            <li key={p.id} className="min-w-0">
              <ResourceCard product={p} />
              <div className="teacher-save"><SaveButton compact resourceTitle={displayTitle(p)} productId={p.id} path="/" initiallySaved={saved.has(p.id)} /></div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[16px] border border-dashed border-border bg-surface p-6 text-center">
          <p className="font-semibold">No resources for this class yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">New ones appear as teachers publish them.</p>
          <Link href={homeHref(filter, { grade: null, subject: null, free: false, type: null })} className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
            Show everything popular
          </Link>
        </div>
      )}
    </section>
  );
}

function HomeFilters({ filter, taxonomy }: { filter: Filter; taxonomy: Awaited<ReturnType<typeof getTaxonomy>> }) {
  const name = (list: { code: string; name: string }[], code: string | null) => list.find((i) => i.code === code)?.name ?? null;
  const grade = name(taxonomy.grades, filter.grade);
  const subject = name(taxonomy.subjects, filter.subject);
  const type = name(taxonomy.categories, filter.type ?? null);
  const filtering = Boolean(filter.grade || filter.subject || filter.free || filter.type);

  const chip = "flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold";
  const on = cn(chip, "bg-primary text-white hover:bg-primary-hover");
  const off = cn(chip, "border border-border bg-surface text-foreground hover:border-primary");

  return (<nav aria-label="Filters for your class" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <ul className="flex items-center gap-2 sm:flex-wrap">
          {grade ? (
            <li>
              <Link href={homeHref(filter, { grade: null })} className={on} aria-label={`Remove filter: ${grade}`}>
                {grade} <X className="size-4" aria-hidden />
              </Link>
            </li>
          ) : (
            <li>
              <Pick label="Grade" chip={off} options={taxonomy.grades.map((o) => ({ name: o.name, href: homeHref(filter, { grade: o.code }) }))} />
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
              <Pick label="Subject" chip={off} options={taxonomy.subjects.map((o) => ({ name: o.name, href: homeHref(filter, { subject: o.code }) }))} />
            </li>
          )}
          {type ? (
            <li>
              <Link href={homeHref(filter, { type: null })} className={on} aria-label={`Remove filter: ${type}`}>
                {type} <X className="size-4" aria-hidden />
              </Link>
            </li>
          ) : (
            <li>
              <Pick label="Type" chip={off} options={taxonomy.categories.map((o) => ({ name: o.name, href: homeHref(filter, { type: o.code }) }))} />
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
              <Link href={homeHref(filter, { grade: null, subject: null, free: false, type: null })} className="flex min-h-10 items-center whitespace-nowrap px-2 text-sm font-semibold text-primary hover:underline">
                Clear filters
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>);
}

/** A filter chip that opens a short list of choices; each choice is a plain link, so it works without JavaScript. */
function Pick({ label, chip, options }: { label: string; chip: string; options: { name: string; href: string }[] }) {
  return (
    <MenuDetails className="group relative">
      <summary className={cn(chip, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        {label} <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="absolute left-0 z-20 mt-2 max-h-72 w-56 overflow-y-auto rounded-[12px] border border-border bg-surface p-1.5 shadow-lg">
        {options.map((o) => (
          <li key={o.href}>
            <Link href={o.href} className="block rounded-md px-3 py-2.5 text-sm font-medium hover:bg-surface-muted">{o.name}</Link>
          </li>
        ))}
      </ul>
    </MenuDetails>
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
  const viewer = await requireViewer("/");
  const supabase = await createClient();
  const { data: ids } = await supabase.from("storefronts").select("id, slug").in("slug", live.map((s) => s.slug));
  const idBySlug = new Map((ids ?? []).map((r) => [r.slug, r.id as string]));
  const storeIds = [...idBySlug.values()];
  const [counts, follows, own] = await Promise.all([
    Promise.all(
      storeIds.map(async (id) => {
        const { data } = await supabase.rpc("shop_follower_count", { p_storefront_id: id });
        return [id, typeof data === "number" ? data : 0] as const;
      }),
    ),
    supabase.from("shop_follows").select("storefront_id").eq("user_id", viewer.id).in("storefront_id", storeIds),
    // Seller accounts are only readable by their owner, so this matches only the viewer's own shop.
    supabase.from("storefronts").select("id, seller_accounts!inner(user_id)").in("id", storeIds).eq("seller_accounts.user_id", viewer.id),
  ]);
  const followers = new Map(counts);
  const following = new Set((follows.data ?? []).map((f) => f.storefront_id as string));
  const mine = new Set((own.data ?? []).map((r) => r.id as string));
  const tones = ["bg-success", "bg-violet-600", "bg-orange-600", "bg-primary"];
  return (
    <section aria-labelledby="shops-h" className="order-6 flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="shops-h" className="font-display text-2xl font-extrabold">Teacher shops you might like</h2>
        <Link href="/browse" className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Browse all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {live.map((s, i) => {
          const id = idBySlug.get(s.slug);
          const n = id ? (followers.get(id) ?? 0) : 0;
          return (
            <li key={s.slug} className="flex w-[270px] shrink-0 snap-start flex-col gap-3 rounded-[16px] border border-border bg-surface p-4 sm:w-auto">
              <Link href={`/shop/${s.slug}`} className="group flex items-center gap-3">
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
                </span>
              </Link>
              {id && !mine.has(id) ? (
                <FollowButton storefrontId={id} path="/" initiallyFollowing={following.has(id)} followers={n} />
              ) : (
                <span className="text-sm text-muted-foreground">{mine.has(id ?? "") ? "Your shop" : null}{n > 0 ? ` · ${count.format(n)} ${n === 1 ? "follower" : "followers"}` : ""}</span>
              )}
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
 * The school year for the grade and subject the teacher saved, as quarters or
 * as terms: which periods already have resources in their library, and a way
 * to fill the first empty one. Without a choice in the URL, it follows
 * whichever calendar their library uses more, and quarters on a tie.
 */
async function SchoolYearPlan({
  teach,
  calendars,
  chosen,
  filter,
}: {
  teach: Filter;
  calendars: Record<Calendar, Period[]>;
  chosen: Calendar | null;
  filter: Filter;
}) {
  if (!teach.grade && !teach.subject) {
    return (
      <section aria-labelledby="plan-h" className={cn(panel, "order-3")}>
        <div className="rounded-[14px] bg-primary p-4 text-white">
          <CalendarDays className="size-6 text-accent" aria-hidden />
          <h2 id="plan-h" className="mt-2 font-display text-lg font-bold">Plan your school year</h2>
          <p className="mt-1 text-sm text-white/85">
            Tell us the grade and subject you teach. We&apos;ll show which quarters or terms your library already covers and find lessons for the rest.
          </p>
        </div>
        <Link href="/account" className={cn(buttonVariants(), "mt-3 w-full")}>Set what I teach</Link>
      </section>
    );
  }
  const ids = (await getLibrary()).map((i) => i.product_id);
  const [byQuarter, byTerm, taxonomy] = await Promise.all([
    getPeriodCoverage(ids, calendars.quarters, teach),
    getPeriodCoverage(ids, calendars.terms, teach),
    getTaxonomy(),
  ]);
  const owned = (c: typeof byQuarter) => c.reduce((n, p) => n + p.owned, 0);
  const calendar: Calendar = chosen ?? (owned(byTerm) > owned(byQuarter) ? "terms" : "quarters");
  const coverage = calendar === "terms" ? byTerm : byQuarter;
  const unit = calendar === "terms" ? "term" : "quarter";
  const covered = coverage.filter((q) => q.owned > 0).length;
  const gap = coverage.find((q) => q.owned === 0);
  const matches = gap ? await countProducts({ grade: teach.grade ?? undefined, subject: teach.subject ?? undefined, period: gap.code }) : 0;
  const label = [taxonomy.grades.find((g) => g.code === teach.grade)?.name, taxonomy.subjects.find((s) => s.code === teach.subject)?.name].filter(Boolean).join(" ");
  const words = ["", "one", "two", "three", "four"];

  return (
    <section aria-labelledby="plan-h" className={cn(panel, "order-3")}>
      <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-primary to-primary-hover p-4 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-white/10" />
        <p className="relative text-xs font-bold uppercase tracking-[0.08em] text-white/80">Your {unit} plan</p>
        <div className="relative mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h2 id="plan-h" className="font-display text-lg font-bold">{label}</h2>
          {/* Schools follow quarters or terms; one tap switches, and the choice stays in the URL. */}
          <nav aria-label="School calendar" className="flex rounded-full bg-white/15 p-0.5 text-xs font-bold">
            {(["quarters", "terms"] as const).map((c) => (
              <Link
                key={c}
                href={homeHref(filter, { plan: c })}
                aria-current={calendar === c ? "true" : undefined}
                className={cn("rounded-full px-2.5 py-1", calendar === c ? "bg-white text-primary" : "text-white hover:bg-white/15")}
              >
                {c === "quarters" ? "Quarters" : "Terms"}
              </Link>
            ))}
          </nav>
        </div>
        <p className="relative mt-2 font-display text-4xl font-extrabold leading-none">
          {covered} <span className="text-base font-semibold text-white/85">of {coverage.length} {unit}s have lessons</span>
        </p>
        <ol className={cn("relative mt-4 grid gap-2", coverage.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
          {coverage.map((q) => (
            <li key={q.code}>
              <Link
                href={browseHref(teach, { period: q.code })}
                aria-label={`${q.name}: ${q.owned ? `${q.owned} owned` : "none yet"}`}
                className={cn(
                  "flex flex-col items-center rounded-[10px] px-1 py-2 text-center",
                  q.owned ? "bg-accent text-foreground" : "bg-white/15 text-white hover:bg-white/25",
                )}
              >
                <span className="font-display text-base font-extrabold">
                  {calendar === "terms" ? "T" : "Q"}
                  {q.sequence}
                </span>
                <span className="text-[11px] font-semibold">{q.owned ? `${q.owned} owned` : "None yet"}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
      {gap ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-accent-soft p-3">
          <div className="min-w-40 flex-1">
            <p className="text-sm font-bold">{gap.name} has nothing yet</p>
            <p className="text-xs text-muted-foreground">
              {matches ? `${count.format(matches)} ${matches === 1 ? "resource matches" : "resources match"}` : "None for your grade yet. See every grade."}
            </p>
          </div>
          {/* With nothing for this grade yet, the button widens the search to every grade. */}
          <Link href={browseHref(matches ? teach : { ...teach, grade: null }, { period: gap.code })} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-foreground hover:bg-accent/90">
            Find lessons
          </Link>
        </div>
      ) : (
        <p className="mt-3 rounded-[12px] bg-success-soft p-3 text-sm font-semibold text-success">
          All {words[coverage.length] ?? coverage.length} {unit}s have lessons in your library.
        </p>
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
