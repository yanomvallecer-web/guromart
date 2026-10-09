import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Seller dashboard" };

export default function SellerDashboardPage() {
  return (
    <PageShell title="Seller dashboard">
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
  const [payout, products] = await Promise.all([
    supabase.from("seller_payout_methods").select("id", { count: "exact", head: true }).eq("seller_account_id", account.id),
    supabase.from("products").select("status").eq("storefront_id", store?.id ?? ""),
  ]);
  const counts = (products.data ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = products.data?.length ?? 0;

  const steps = [
    { label: "Create your account", done: true },
    { label: "Choose your seller type", done: true },
    { label: "Create your shop", done: Boolean(store) },
    { label: "Verify your identity", done: account.verification_status === "verified", pending: account.verification_status === "pending", href: "/seller/verify" },
    { label: "Add payout details", done: (payout.count ?? 0) > 0, href: "/seller/verify" },
    { label: "Upload your first resource", done: total > 0, href: "/seller/products/new" },
    { label: "Submit it for review", done: (counts.pending_review ?? 0) + (counts.published ?? 0) > 0 },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm text-muted-foreground">Your shop</p>
            <p className="font-display text-2xl font-bold">{store?.name}</p>
            <p className="text-sm text-muted-foreground">guromart.ph/shop/{store?.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{STATUS_LABEL[account.status] ?? account.status}</Badge>
            <Badge className="bg-surface-muted capitalize text-foreground">{account.plan} plan</Badge>
          </div>
        </Card>
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Your resources</h2>
            <div className="flex gap-3 text-sm font-semibold">
              <Link href="/seller/products" className="text-primary hover:underline">Manage resources</Link>
              <Link href="/seller/products/new" className="text-primary hover:underline">Add a resource</Link>
            </div>
          </div>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t added any resources yet. Start a draft, upload your files, then submit it for review.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(["draft", "pending_review", "published", "rejected"] as const).map((s) => (
                <div key={s}>
                  <dt className="text-sm capitalize text-muted-foreground">{s.replace("_", " ")}</dt>
                  <dd className="font-display text-2xl font-bold">{counts[s] ?? 0}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Getting started</h2>
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
    </div>
  );
}
