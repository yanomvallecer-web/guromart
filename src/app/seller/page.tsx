import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FilePlus2,
  ImagePlus,
  Layers,
  PartyPopper,
  PencilLine,
  ShoppingBag,
  Store,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { BrandBanner, PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge, Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { CopyButton } from "@/components/site/copy-button";
import { ListingThumb } from "@/components/seller/listing-thumb";
import { getEarnings } from "@/lib/commerce/earnings";
import { formatAmount, formatPrice } from "@/lib/format";
import { listOwnListings } from "@/lib/listings/seller";
import { LISTING_STATUS } from "@/lib/listings/status";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Seller dashboard" };

export default function SellerDashboardPage() {
  return (
    <PageShell title="Seller dashboard" plain>
      <Suspense fallback={<PanelSkeleton />}>
        <Dashboard />
      </Suspense>
    </PageShell>
  );
}

const STATUS_LABEL: Record<string, string> = {
  onboarding: "Setting up",
  active: "Active",
  suspended: "Suspended",
  closed: "Closed",
};

const count = new Intl.NumberFormat("en-PH");

/** "Good morning" and so on, by the clock in the Philippines. */
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

async function Dashboard() {
  const viewer = await requireArea("seller", "/seller");
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("seller_accounts")
    .select("id, seller_type, status, plan, verification_status, storefronts(id, slug, name, is_published)")
    .eq("user_id", viewer.id)
    .maybeSingle();

  if (!account) {
    return (
      <Card className="p-6">
        <p>Your account has seller access but no shop yet.</p>
        <Link href="/sell" className="font-semibold text-primary hover:underline">Open a shop</Link>
      </Card>
    );
  }

  const store = Array.isArray(account.storefronts) ? account.storefronts[0] : account.storefronts;
  const [payout, products, listings, followers, earnings] = await Promise.all([
    supabase.from("seller_payout_methods").select("id", { count: "exact", head: true }).eq("seller_account_id", account.id),
    supabase.from("products").select("id, title, topic, status, sales_count, download_count").eq("storefront_id", store?.id ?? ""),
    store ? listOwnListings(store.id) : Promise.resolve([]),
    store ? supabase.rpc("shop_follower_count", { p_storefront_id: store.id }) : Promise.resolve({ data: 0 }),
    getEarnings(account.id),
  ]);
  const rows = products.data ?? [];
  const recent = listings.slice(0, 6);
  const missingPreview = listings.filter((l) => !l.preview_path).length;
  const counts = rows.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = rows.length;
  const sales = rows.reduce((s, p) => s + (p.sales_count ?? 0), 0);
  const downloads = rows.reduce((s, p) => s + (p.download_count ?? 0), 0);
  const best = rows
    .filter((p) => p.status === "published" && (p.sales_count ?? 0) + (p.download_count ?? 0) > 0)
    .sort((a, b) => b.sales_count - a.sales_count || b.download_count - a.download_count)[0];
  const shopUrl = store ? `${publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/shop/${store.slug}` : null;

  const steps = [
    { label: "Create your account", done: true },
    { label: "Choose your seller type", done: true },
    { label: "Create your shop", done: Boolean(store) },
    { label: "Verify your identity", done: account.verification_status === "verified", pending: account.verification_status === "pending", href: "/seller/verify" },
    { label: "Add payout details", done: (payout.count ?? 0) > 0, href: "/seller/verify" },
    { label: "Upload your first resource", done: total > 0, href: "/seller/products/new" },
    { label: "Submit it for review", done: (counts.pending_review ?? 0) + (counts.published ?? 0) > 0 },
  ];
  const stepsDone = steps.filter((s) => s.done).length;

  // Only things the seller can act on, each with where to go.
  const attention = [
    counts.rejected
      ? { icon: AlertTriangle, tone: "bg-danger-soft text-danger", text: `${counts.rejected} ${counts.rejected === 1 ? "resource needs" : "resources need"} changes before it can go live.`, href: "/seller/products" }
      : null,
    missingPreview
      ? { icon: ImagePlus, tone: "bg-accent-soft text-foreground", text: `${missingPreview} ${missingPreview === 1 ? "resource has" : "resources have"} no preview image yet. Teachers see a plain cover until you add at least 2.`, href: "/seller/products" }
      : null,
    counts.draft
      ? { icon: PencilLine, tone: "bg-primary-soft text-primary", text: `${counts.draft} ${counts.draft === 1 ? "draft is" : "drafts are"} waiting. Finish and submit to start selling.`, href: "/seller/products" }
      : null,
  ].filter((a) => a !== null);

  const stats = [
    { label: "Lifetime earnings", value: formatAmount(earnings.lifetimeCentavos), icon: Wallet, tone: "green" as const, href: "/seller/earnings" },
    { label: "Sales", value: count.format(sales), icon: ShoppingBag, tone: "blue" as const, href: "/seller/earnings" },
    { label: "Downloads", value: count.format(downloads), icon: Download, tone: "yellow" as const, href: "/seller/products" },
    { label: "Followers", value: count.format(Number(followers.data ?? 0)), icon: Users, tone: "red" as const, href: shopUrl ?? "/seller/shop" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome banner: the shop, its link, and the one thing most sellers do next. */}
      <BrandBanner label="Your shop">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-semibold text-primary-foreground/80">{greeting()}! Here&apos;s how your shop is doing.</p>
            <p className="font-display text-3xl font-bold sm:text-4xl">{store?.name}</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-white/15 text-primary-foreground">{STATUS_LABEL[account.status] ?? account.status}</Badge>
              <Badge className="bg-white/15 capitalize text-primary-foreground">{account.plan} plan</Badge>
              <Badge className="bg-accent text-foreground">{counts.published ?? 0} live</Badge>
            </div>
            {shopUrl ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <a href={shopUrl} className="break-all text-sm font-medium text-primary-foreground underline underline-offset-4" data-testid="shop-url">
                  {shopUrl.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton text={shopUrl} label="Copy link" />
              </div>
            ) : null}
            {store && !store.is_published ? (
              <p className="text-xs text-primary-foreground/80">Your shop isn&apos;t public yet, so this link opens only for you until it is.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/seller/products/new" className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-foreground hover:bg-accent/90">
              <FilePlus2 className="size-4" aria-hidden /> Add a resource
            </Link>
            {shopUrl ? (
              <a href={shopUrl} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-primary hover:bg-white/90">
                <Store className="size-4" aria-hidden /> View your shop
              </a>
            ) : null}
          </div>
        </div>
      </BrandBanner>

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Shop numbers" data-testid="seller-stats">
        {stats.map((s) => (
          <li key={s.label}>
            <StatTile {...s} />
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          {attention.length ? (
            <Card className="p-6">
              <h2 className="mb-3 font-display text-xl font-bold">Needs your attention</h2>
              <ul className="flex flex-col gap-2" data-testid="seller-attention">
                {attention.map((a) => (
                  <li key={a.text}>
                    <Link href={a.href} className="group flex items-center gap-3 rounded-[10px] p-2 text-sm text-foreground no-underline hover:bg-surface-muted">
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", a.tone)}>
                        <a.icon className="size-4" aria-hidden />
                      </span>
                      <span className="flex-1">{a.text}</span>
                      <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold">Your resources</h2>
              <Link href="/seller/products" className="text-sm font-semibold text-primary hover:underline">Manage resources</Link>
            </div>
            {total === 0 ? (
              <p className="text-sm text-muted-foreground">You haven&apos;t added any resources yet. Start a draft, upload your files, then submit it for review.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["draft", "pending_review", "published", "rejected"] as const).map((s) => (
                  <div key={s} className={cn("rounded-[12px] px-4 py-3", LISTING_STATUS[s].tone)}>
                    <dt className="text-sm font-medium">{LISTING_STATUS[s].label}</dt>
                    <dd className="font-display text-2xl font-bold">{counts[s] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            )}
            {recent.length ? (
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="recent-resources">
                {recent.map((l) => {
                  const status = LISTING_STATUS[l.status] ?? LISTING_STATUS.draft;
                  return (
                    <li key={l.id} className="min-w-0">
                      <Link href={`/seller/products/${l.id}`} className="group flex flex-col gap-1.5">
                        <ListingThumb path={l.preview_path} className="w-full transition group-hover:shadow-md" />
                        <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary group-hover:underline">{l.topic || l.title}</span>
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge className={status.tone}>{status.label}</Badge>
                          <span className="font-semibold">{formatPrice(l.price_centavos)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {best ? (
            <Card className="flex items-start gap-3 bg-accent-soft p-5" data-testid="best-seller">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-foreground">
                <Trophy className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Your top resource</p>
                <Link href={`/seller/products/${best.id}`} className="line-clamp-2 font-display text-lg font-bold text-foreground hover:text-primary hover:underline">
                  {best.topic?.trim() || best.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {count.format(best.sales_count)} {best.sales_count === 1 ? "sale" : "sales"} · {count.format(best.download_count)}{" "}
                  {best.download_count === 1 ? "download" : "downloads"}
                </p>
              </div>
            </Card>
          ) : null}

          {stepsDone < steps.length ? (
            <Card className="p-6">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold">Getting started</h2>
                <span className="text-sm font-semibold text-primary">{stepsDone} of {steps.length} done</span>
              </div>
              <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={stepsDone}
                className="mb-4 h-2.5 overflow-hidden rounded-full bg-surface-muted"
              >
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(stepsDone / steps.length) * 100}%` }} />
              </div>
              <ol className="flex flex-col gap-3">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-3 text-sm">
                    {s.done ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <Circle className="size-5 text-input" aria-hidden />}
                    <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>
                      {i + 1}.{" "}
                      {"href" in s && s.href && !s.done ? (
                        <Link href={s.href} className="text-primary hover:underline">{s.label}</Link>
                      ) : (
                        s.label
                      )}
                      {"pending" in s && s.pending ? " (in review)" : ""}
                    </span>
                    <span className="sr-only">{s.done ? "done" : "not done"}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : (
            <Card className="flex items-center gap-3 bg-success-soft p-5">
              <PartyPopper className="size-6 shrink-0 text-success" aria-hidden />
              <p className="text-sm font-medium">Your shop is fully set up. Keep adding resources to grow it.</p>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="mb-3 font-display text-xl font-bold">Quick actions</h2>
            <ul className="flex flex-col gap-1">
              {[
                { href: "/seller/bundles", label: "Lesson bundles", icon: Layers },
                { href: "/seller/shop", label: "Edit shop profile", icon: Store },
                { href: "/seller/earnings", label: "Earnings", icon: Wallet },
              ].map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-[10px] p-2 font-semibold text-foreground no-underline hover:bg-primary-soft hover:text-primary">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <a.icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1">{a.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
              {shopUrl ? (
                <li>
                  <a href={shopUrl} className="group flex items-center gap-3 rounded-[10px] p-2 font-semibold text-foreground no-underline hover:bg-primary-soft hover:text-primary">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <ExternalLink className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1">See your shop as teachers do</span>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </a>
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
