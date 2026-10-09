import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { getReviewQueue } from "@/lib/admin/review";
import { requireArea } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Review listings", robots: { index: false } };

export default function ReviewQueuePage() {
  return (
    <PageShell
      title="Review listings"
      description="Resources sellers have submitted, oldest first. Check every file before approving."
      actions={<Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Admin overview</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Queue />
      </Suspense>
    </PageShell>
  );
}

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

async function Queue() {
  await requireArea("admin", "/admin/listings");
  const queue = await getReviewQueue();
  if (queue.length === 0) {
    return (
      <EmptyState icon={<ClipboardCheck aria-hidden />} title="Nothing to review">
        New submissions from sellers will appear here.
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-border">
      {queue.map((item) => (
        <Link key={item.id} href={`/admin/listings/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-muted sm:px-6">
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.title}</p>
            <p className="text-sm text-muted-foreground">
              {item.shop} · submitted {when.format(new Date(item.updated_at))}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{formatPrice(item.price_centavos)}</span>
            <Badge className={item.unchecked ? "bg-accent-soft text-foreground" : "bg-success-soft text-success"}>
              {item.unchecked ? `${item.unchecked} of ${item.file_count} files to check` : "Files checked"}
            </Badge>
          </div>
        </Link>
      ))}
    </Card>
  );
}
