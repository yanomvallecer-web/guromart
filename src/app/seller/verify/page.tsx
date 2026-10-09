import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck, Wallet } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { getSellerContext } from "@/lib/listings/seller";
import { createClient } from "@/lib/supabase/server";
import { PAYOUT_METHODS, VERIFICATION_KINDS, maskAccount } from "@/lib/validation/payout";
import { IdUpload } from "./id-upload";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "Verification and payouts" };

export default function VerifyPage() {
  return (
    <PageShell
      title="Verification and payouts"
      description="GuroMart pays sellers only after confirming who they are. Your ID and account details are visible only to you and GuroMart staff."
      actions={<Link href="/seller" className="text-sm font-semibold text-primary hover:underline">Seller dashboard</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Verify />
      </Suspense>
    </PageShell>
  );
}

const STATUS: Record<string, { label: string; tone: string; text: string }> = {
  unverified: { label: "Not verified", tone: "bg-surface-muted text-foreground", text: "Upload a clear photo or scan of one valid ID." },
  pending: { label: "In review", tone: "bg-accent-soft text-foreground", text: "GuroMart staff are checking your ID. We'll notify you when it's done." },
  verified: { label: "Verified", tone: "bg-success-soft text-success", text: "Your identity is confirmed. Payouts are enabled once your earnings reach ₱500." },
  rejected: { label: "Needs a new ID", tone: "bg-danger-soft text-danger", text: "Please upload a new photo or scan." },
};

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

async function Verify() {
  const viewer = await requireArea("seller", "/seller/verify");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  const supabase = await createClient();
  const [account, latest, payout] = await Promise.all([
    supabase.from("seller_accounts").select("verification_status").eq("id", ctx.sellerAccountId).single(),
    supabase
      .from("seller_verifications")
      .select("kind, status, reviewer_notes, submitted_at")
      .eq("seller_account_id", ctx.sellerAccountId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("seller_payout_methods")
      .select("method, account_name, account_number, bank_name")
      .eq("seller_account_id", ctx.sellerAccountId)
      .eq("is_default", true)
      .maybeSingle(),
  ]);
  const status = account.data?.verification_status ?? "unverified";
  const s = STATUS[status] ?? STATUS.unverified;
  const kindLabel = VERIFICATION_KINDS.find((k) => k.value === latest.data?.kind)?.label;
  const method = PAYOUT_METHODS.find((m) => m.value === payout.data?.method)?.label;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <ShieldCheck className="size-5 text-primary" aria-hidden /> Identity
          </h2>
          <Badge className={s.tone} data-testid="verification-status">{s.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{s.text}</p>
        {latest.data ? (
          <p className="text-sm">
            Last sent: {kindLabel ?? latest.data.kind}, {when.format(new Date(latest.data.submitted_at))}
          </p>
        ) : null}
        {status === "rejected" && latest.data?.reviewer_notes ? (
          <div className="rounded-[10px] bg-danger-soft p-3 text-sm text-danger">
            <p className="font-semibold">Reviewer notes</p>
            <p>{latest.data.reviewer_notes}</p>
          </div>
        ) : null}
        {status === "unverified" || status === "rejected" ? <IdUpload kinds={VERIFICATION_KINDS.map((k) => ({ value: k.value, label: k.label }))} /> : null}
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Wallet className="size-5 text-primary" aria-hidden /> Payout details
        </h2>
        <p className="text-sm text-muted-foreground">
          Where GuroMart sends your earnings. Payouts go out every two weeks once your available balance is ₱500 or more, after a
          7-day hold on each sale.
        </p>
        {payout.data ? (
          <p className="rounded-[10px] bg-surface-muted p-3 text-sm" data-testid="payout-current">
            Current: {method} · {payout.data.bank_name ? `${payout.data.bank_name} · ` : ""}
            {payout.data.account_name} · {maskAccount(payout.data.account_number)}
          </p>
        ) : null}
        <PayoutForm hasExisting={Boolean(payout.data)} methods={PAYOUT_METHODS.map((m) => ({ value: m.value, label: m.label }))} />
      </Card>
    </div>
  );
}
