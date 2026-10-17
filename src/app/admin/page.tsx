import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, BadgeCheck, CalendarDays, CheckCircle2, Coins, FileSearch, Flag, IdCard, Images, MessageSquareWarning,
  ReceiptText, Star, Store, UserCog, Users,
} from "lucide-react";
import { SalesChart } from "@/components/admin/sales-chart";
import { BrandBanner, PanelSkeleton } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { firstName } from "@/lib/account/greeting";
import { PAID_STATUSES, getSalesSummary } from "@/lib/admin/sales";
import { requireArea } from "@/lib/auth/dal";
import { formatAmount } from "@/lib/format";
import { METHOD_NAME, accountPaymentMethods, livePaymentsAllowed, paymentMethods } from "@/lib/payments/paymongo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { WebhookSetup } from "./webhook-setup";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 sm:px-6">
      <Suspense fallback={<PanelSkeleton />}>
        <Overview />
      </Suspense>
      <Suspense fallback={<PanelSkeleton />}>
        <PaymentsCheck />
      </Suspense>
    </div>
  );
}

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const count = new Intl.NumberFormat("en-PH");
const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** Audit actions in words. Unknown ones fall back to the raw code. */
const ACTIVITY: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  "product.status_changed": { label: "A resource changed status", icon: FileSearch, tone: "bg-primary-soft text-primary" },
  "listing.approved": { label: "A resource was approved", icon: CheckCircle2, tone: "bg-success-soft text-success" },
  "listing.rejected": { label: "A resource was sent back", icon: Flag, tone: "bg-danger-soft text-danger" },
  "seller.onboarding_started": { label: "Someone started setting up a shop", icon: Store, tone: "bg-accent-soft text-foreground" },
  "seller.activated": { label: "A shop went live", icon: BadgeCheck, tone: "bg-success-soft text-success" },
  "seller.verification_submitted": { label: "A seller sent an ID to check", icon: IdCard, tone: "bg-primary-soft text-primary" },
  "seller.verification_reviewed": { label: "A seller ID was reviewed", icon: IdCard, tone: "bg-success-soft text-success" },
  "order.paid": { label: "An order was paid", icon: Coins, tone: "bg-success-soft text-success" },
  "order.paid_late": { label: "A late payment came in", icon: Coins, tone: "bg-accent-soft text-foreground" },
  "payment.failed": { label: "A payment failed", icon: Flag, tone: "bg-danger-soft text-danger" },
  "payment.mismatch": { label: "A payment amount didn't match", icon: Flag, tone: "bg-danger-soft text-danger" },
  "role.granted": { label: "A role was given", icon: UserCog, tone: "bg-primary-soft text-primary" },
  "role.revoked": { label: "A role was removed", icon: UserCog, tone: "bg-accent-soft text-foreground" },
  "conversation.report": { label: "A chat was reported", icon: MessageSquareWarning, tone: "bg-danger-soft text-danger" },
  "conversation.report_cleared": { label: "A chat report was cleared", icon: MessageSquareWarning, tone: "bg-success-soft text-success" },
};

const TOOLS: { href: string; label: string; note: string; icon: LucideIcon; tone: string }[] = [
  { href: "/admin/sales", label: "Sales", note: "Orders, payments and earnings", icon: ReceiptText, tone: "bg-success-soft text-success" },
  { href: "/admin/accounts", label: "Accounts", note: "Everyone who signed up", icon: Users, tone: "bg-primary-soft text-primary" },
  { href: "/admin/listings", label: "Resource review", note: "Approve new listings", icon: FileSearch, tone: "bg-accent-soft text-foreground" },
  { href: "/admin/verifications", label: "Seller verification", note: "Check seller IDs", icon: IdCard, tone: "bg-primary-soft text-primary" },
  { href: "/admin/reviews", label: "Reviews", note: "Hide reviews that break the rules", icon: Star, tone: "bg-accent-soft text-foreground" },
  { href: "/admin/messages", label: "Reported chats", note: "Chats a teacher or seller reported", icon: MessageSquareWarning, tone: "bg-danger-soft text-danger" },
  { href: "/admin/slide-previews", label: "Slide previews", note: "Add previews to PowerPoint listings", icon: Images, tone: "bg-success-soft text-success" },
];

async function Overview() {
  const viewer = await requireArea("admin", "/admin");
  const supabase = await createClient();
  const head = (table: string) => supabase.from(table).select("*", { count: "exact", head: true });

  const [users, sellers, onboarding, pending, published, reports, verifications, chats, audit, sales, recent] = await Promise.all([
    head("profiles"),
    head("seller_accounts").eq("status", "active"),
    head("seller_accounts").eq("status", "onboarding"),
    head("products").eq("status", "pending_review"),
    head("products").eq("status", "published"),
    head("copyright_reports").in("status", ["submitted", "under_review"]),
    head("seller_verifications").eq("status", "pending"),
    head("conversations").not("reported_at", "is", null),
    supabase.from("audit_logs").select("id, action, created_at").order("created_at", { ascending: false }).limit(8),
    getSalesSummary(),
    // Signed in as an admin above; other people's orders need the service role.
    createAdminClient()
      .from("orders")
      .select("id, order_number, total_centavos, paid_at, order_items(title_snapshot)")
      .in("status", [...PAID_STATUSES])
      .gt("total_centavos", 0)
      .order("paid_at", { ascending: false })
      .limit(5),
  ]);

  const attention = [
    { label: "Resources waiting for review", value: pending.count ?? 0, href: "/admin/listings" },
    { label: "Verifications to review", value: verifications.count ?? 0, href: "/admin/verifications" },
    { label: "Reported chats", value: chats.count ?? 0, href: "/admin/messages" },
    { label: "Open copyright reports", value: reports.count ?? 0, href: null },
  ];
  const waiting = attention.reduce((n, a) => n + a.value, 0);

  return (
    <div className="flex flex-col gap-6">
      <BrandBanner label="Admin">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-sm font-semibold text-primary-foreground/80">Admin</h1>
            <p className="font-display text-3xl font-bold sm:text-4xl">
              {greeting()}, {firstName(viewer.displayName)}!
            </p>
            <p className="text-primary-foreground/85">
              {waiting ? `${waiting} ${waiting === 1 ? "thing needs" : "things need"} you today.` : "Nothing is waiting for you right now."}{" "}
              GuroMart made {formatAmount(sales.today)} today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/sales" className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-foreground hover:bg-accent/90">
              <ReceiptText className="size-4" aria-hidden /> See sales
            </Link>
            <Link href="/admin/listings" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-primary hover:bg-white/90">
              <FileSearch className="size-4" aria-hidden /> Review resources
            </Link>
          </div>
        </div>
      </BrandBanner>

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="Marketplace numbers" data-testid="admin-stats">
        <li><StatTile label="Sales today" value={formatAmount(sales.today)} icon={Coins} tone="green" href="/admin/sales" /></li>
        <li><StatTile label="Sales this month" value={formatAmount(sales.thisMonth)} icon={CalendarDays} tone="blue" href="/admin/sales" /></li>
        <li><StatTile label="Live resources" value={count.format(published.count ?? 0)} icon={FileSearch} tone="yellow" href="/browse" /></li>
        <li><StatTile label="Accounts" value={count.format(users.count ?? 0)} icon={Users} tone="blue" href="/admin/accounts" /></li>
        <li><StatTile label="Active sellers" value={count.format(sellers.count ?? 0)} icon={BadgeCheck} tone="green" href="/admin/accounts?show=sellers" /></li>
        <li><StatTile label="Sellers setting up" value={count.format(onboarding.count ?? 0)} icon={Store} tone="red" href="/admin/accounts?show=sellers" /></li>
      </ul>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col gap-4 p-6">
          <SalesChart daily={sales.daily} />
          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Latest sales</h2>
              <Link href="/admin/sales" className="text-sm font-semibold text-primary hover:underline">All sales</Link>
            </div>
            {recent.data?.length ? (
              <ul className="flex flex-col divide-y divide-border" data-testid="latest-sales">
                {recent.data.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.order_items.map((i) => i.title_snapshot).join(", ")}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.order_number}
                        {o.paid_at ? ` · ${when.format(new Date(o.paid_at))}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-success">+{formatAmount(o.total_centavos)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No paid sales yet. They&apos;ll show here as soon as a teacher pays.</p>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-6" data-testid="admin-attention">
          <h2 className="font-display text-lg font-bold">Needs your attention</h2>
          <ul className="flex flex-col gap-2">
            {attention.map((a) => {
              const inner = (
                <>
                  <span className="text-sm">{a.label}</span>
                  <span
                    className={cn(
                      "min-w-8 rounded-full px-2.5 py-0.5 text-center text-sm font-bold",
                      a.value ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
                    )}
                  >
                    {a.value}
                  </span>
                </>
              );
              const cls = "flex items-center justify-between gap-3 rounded-[10px] border border-border p-3";
              return (
                <li key={a.label}>
                  {a.href ? (
                    <Link href={a.href} className={cn(cls, "text-foreground no-underline hover:border-primary")}>{inner}</Link>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {!waiting ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="size-4" aria-hidden /> All clear
            </p>
          ) : null}
        </Card>
      </div>

      <section aria-labelledby="tools-heading" className="flex flex-col gap-3">
        <h2 id="tools-heading" className="font-display text-xl font-bold">Admin tools</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex h-full items-center gap-3 rounded-[12px] border border-border bg-surface p-4 text-foreground no-underline transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", t.tone)}>
                  <t.icon className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.note}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Card className="p-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold">
          <Activity className="size-5 text-primary" aria-hidden /> Recent activity
        </h2>
        {audit.data?.length ? (
          <ul className="flex flex-col divide-y divide-border" data-testid="admin-activity">
            {audit.data.map((a) => {
              const look = ACTIVITY[a.action] ?? { label: a.action, icon: Activity, tone: "bg-surface-muted text-muted-foreground" };
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", look.tone)}>
                    <look.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">{look.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{when.format(new Date(a.created_at))}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        )}
      </Card>
    </div>
  );
}

/** What payments need, checked live with PayMongo. Keys are never shown, only whether they're set. */
async function PaymentsCheck() {
  await requireArea("admin", "/admin");
  const offered = paymentMethods();
  const account = await accountPaymentMethods();
  const webhookSet = Boolean(process.env.PAYMONGO_WEBHOOK_SECRET?.trim());
  const name = (m: string) => METHOD_NAME[m] ?? m;
  const missing = account.ok ? offered.filter((m) => !account.methods.includes(m)) : [];
  return (
    <Card className="mt-6 flex flex-col gap-2 p-6" data-testid="payments-check">
      <h2 className="font-display text-xl font-bold">Payments</h2>
      <p className="text-sm">
        <span className="text-muted-foreground">GuroMart offers:</span> {offered.map(name).join(", ")}
      </p>
      {account.ok ? (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">PayMongo ({account.mode} mode) allows this account:</span>{" "}
            {account.methods.length ? account.methods.map(name).join(", ") : "no methods listed"}
          </p>
          <p className={`text-sm font-semibold ${missing.length ? "text-danger" : "text-success"}`}>
            {missing.length
              ? `Not allowed yet: ${missing.map(name).join(", ")}. Checkout would fail for these.`
              : "Every method GuroMart offers is allowed."}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">PayMongo check: {account.error}</p>
      )}
      {account.ok && account.mode === "live" ? (
        livePaymentsAllowed() ? (
          <p className="text-sm font-semibold text-success" data-testid="live-payments-on">
            Real payments are ON: buyers are charged real money.
          </p>
        ) : (
          <p className="text-sm font-semibold text-danger" data-testid="live-key-warning">
            PAYMONGO_SECRET_KEY in Vercel is the LIVE key, but real payments are off, so checkout stays closed. Set PAYMONGO_LIVE_PAYMENTS to
            &quot;on&quot; in Vercel to start taking real payments.
          </p>
        )
      ) : null}
      <p className="text-sm text-muted-foreground">Webhook secret: {webhookSet ? "set" : "not set yet (checkout stays closed until it is)"}</p>
      {!webhookSet && account.ok ? <WebhookSetup /> : null}
    </Card>
  );
}
