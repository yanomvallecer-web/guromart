import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { METHOD_NAME, accountPaymentMethods, paymentMethods } from "@/lib/payments/paymongo";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <PageShell title="Admin" description="Marketplace overview. Every number here is a live count from the database.">
      <Suspense fallback={<PanelSkeleton />}>
        <Overview />
      </Suspense>
      <Suspense fallback={<PanelSkeleton />}>
        <PaymentsCheck />
      </Suspense>
    </PageShell>
  );
}

async function Overview() {
  await requireArea("admin", "/admin");
  const supabase = await createClient();
  const count = (table: string, filter?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = base(table);
    return filter ? filter(q) : q;
  };
  function base(table: string) {
    return supabase.from(table).select("*", { count: "exact", head: true });
  }

  const [users, sellers, onboarding, pending, published, reports, verifications, audit] = await Promise.all([
    count("profiles"),
    count("seller_accounts", (q) => q.eq("status", "active")),
    count("seller_accounts", (q) => q.eq("status", "onboarding")),
    count("products", (q) => q.eq("status", "pending_review")),
    count("products", (q) => q.eq("status", "published")),
    count("copyright_reports", (q) => q.in("status", ["submitted", "under_review"])),
    count("seller_verifications", (q) => q.eq("status", "pending")),
    supabase.from("audit_logs").select("id, action, entity_type, entity_id, created_at").order("created_at", { ascending: false }).limit(15),
  ]);

  const tiles = [
    { label: "Accounts", value: users.count },
    { label: "Active sellers", value: sellers.count },
    { label: "Sellers setting up", value: onboarding.count },
    { label: "Live resources", value: published.count },
    { label: "Resources waiting for review", value: pending.count, href: "/admin/listings" },
    { label: "Verifications to review", value: verifications.count, href: "/admin/verifications" },
    { label: "Open copyright reports", value: reports.count },
  ];


  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <dt className="text-sm text-muted-foreground">
              {"href" in t && t.href ? <Link href={t.href} className="font-semibold text-primary hover:underline">{t.label}</Link> : t.label}
            </dt>
            <dd className="font-display text-3xl font-bold">{t.value ?? 0}</dd>
          </Card>
        ))}
      </dl>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm">Add slide previews to PowerPoint listings that only have a cover.</p>
        <Link href="/admin/slide-previews" className="text-sm font-semibold text-primary hover:underline">
          Slide previews
        </Link>
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Recent activity</h2>
        {audit.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-semibold">When</th>
                  <th className="py-2 pr-4 font-semibold">Action</th>
                  <th className="py-2 font-semibold">Record</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(a.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td>
                    <td className="py-2 pr-4">{a.action}</td>
                    <td className="py-2 text-muted-foreground">{a.entity_type} {a.entity_id?.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <p className="text-sm text-muted-foreground">Webhook secret: {webhookSet ? "set" : "not set yet (checkout stays closed until it is)"}</p>
    </Card>
  );
}
