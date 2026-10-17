import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reported chats", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

export default function AdminMessagesPage() {
  return (
    <PageShell title="Reported chats" description="Chats a teacher or seller reported. Staff can read a chat only while its report is open.">
      <Suspense fallback={<PanelSkeleton />}>
        <List />
      </Suspense>
    </PageShell>
  );
}

async function List() {
  await requireArea("admin", "/admin/messages");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, reported_at, report_reason, storefronts(name)")
    .not("reported_at", "is", null)
    .order("reported_at", { ascending: false });
  if (error) throw new Error(`Could not load reports: ${error.message}`);
  const rows = data as unknown as { id: string; reported_at: string; report_reason: string | null; storefronts: { name: string } | null }[];
  if (rows.length === 0) return <EmptyState icon={<MessageCircle />} title="No open reports" />;
  return (
    <Card className="divide-y divide-border">
      {rows.map((r) => (
        <Link key={r.id} href={`/messages/${r.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-muted">
          <span className="font-semibold">Chat with {r.storefronts?.name ?? "a shop"}</span>
          <span className="text-sm">{r.report_reason}</span>
          <span className="text-xs text-muted-foreground">Reported {when.format(new Date(r.reported_at))}</span>
        </Link>
      ))}
    </Card>
  );
}
