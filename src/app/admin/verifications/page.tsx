import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IdCard } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { VERIFICATION_KINDS } from "@/lib/validation/payout";
import { decideVerification } from "./actions";
import { VerificationDecision } from "./decision-form";

export const metadata: Metadata = { title: "Seller verification", robots: { index: false } };

export default function VerificationsPage() {
  return (
    <PageShell
      title="Seller verification"
      description="Check each ID is readable, unexpired and matches the seller's name and payout account."
      actions={<Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Admin overview</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Queue />
      </Suspense>
    </PageShell>
  );
}

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

type Row = {
  id: string;
  kind: string;
  submitted_at: string;
  seller_accounts: {
    seller_type: string;
    user_id: string;
    storefronts: { name: string } | null;
    seller_payout_methods: { account_name: string; method: string }[];
  } | null;
};

async function Queue() {
  await requireArea("admin", "/admin/verifications");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seller_verifications")
    .select("id, kind, submitted_at, seller_accounts(seller_type, user_id, storefronts(name), seller_payout_methods(account_name, method))")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Could not load verification requests: ${error.message}`);
  const rows = data as unknown as Row[];
  if (rows.length === 0) {
    return (
      <EmptyState icon={<IdCard aria-hidden />} title="No IDs to review">
        Sellers&apos; ID submissions will appear here.
      </EmptyState>
    );
  }
  const userIds = rows.map((r) => r.seller_accounts?.user_id).filter((v): v is string => Boolean(v));
  const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string]));

  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => {
        const account = r.seller_accounts;
        const payoutName = account?.seller_payout_methods[0]?.account_name;
        return (
          <Card key={r.id} className="grid gap-4 p-6 md:grid-cols-[1fr_1fr]" data-testid="verification-request">
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-display text-lg font-bold">{account?.storefronts?.name ?? "Unknown shop"}</p>
              <p>Account name: {nameOf.get(account?.user_id ?? "") ?? "Unknown"}</p>
              <p>Payout account name: {payoutName ?? "Not added yet"}</p>
              <p className="capitalize text-muted-foreground">{account?.seller_type} seller · sent {when.format(new Date(r.submitted_at))}</p>
              <p>{VERIFICATION_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</p>
              <a href={`/admin/verification-files/${r.id}`} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                Open the document (logged)
              </a>
            </div>
            <VerificationDecision id={r.id} action={decideVerification.bind(null, r.id)} />
          </Card>
        );
      })}
    </div>
  );
}
