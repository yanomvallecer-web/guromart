import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card } from "@/components/ui/card";
import { getListingForReview } from "@/lib/admin/review";
import { requireArea } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/format";
import { LICENSE_TYPES } from "@/lib/listings/schema";
import { LISTING_STATUS } from "@/lib/listings/status";
import { publicObjectUrl } from "@/lib/storage";
import { reviewListing } from "../actions";
import { DecisionForm, FileCheck } from "./review-controls";

export const metadata: Metadata = { title: "Review listing", robots: { index: false } };

export default function ReviewListingPage(props: PageProps<"/admin/listings/[id]">) {
  return (
    <PageShell
      title="Review listing"
      actions={<Link href="/admin/listings" className="text-sm font-semibold text-primary hover:underline">Back to the queue</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Review params={props.params} />
      </Suspense>
    </PageShell>
  );
}

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireArea("admin", `/admin/listings/${id}`);
  const l = await getListingForReview(id);
  const status = LISTING_STATUS[l.status] ?? LISTING_STATUS.draft;
  const license = LICENSE_TYPES.find((t) => t.value === l.license_type)?.label ?? l.license_type;
  const unchecked = l.files.filter((f) => f.scan_status !== "clean").length;
  const shopOpens = !l.shop.is_published || l.shop.seller_status === "onboarding";

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">{l.title}</h2>
              {l.summary ? <p className="text-muted-foreground">{l.summary}</p> : null}
            </div>
            <Badge className={status.tone} data-testid="review-status">{status.label}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Price</dt><dd className="font-semibold">{formatPrice(l.price_centavos)}</dd></div>
            <div><dt className="text-muted-foreground">Type</dt><dd>{l.category ?? "Not set"}</dd></div>
            <div><dt className="text-muted-foreground">Subject</dt><dd>{l.subject ?? "Not set"}</dd></div>
            <div><dt className="text-muted-foreground">Grades</dt><dd>{l.grades.join(", ") || "Not set"}</dd></div>
            <div><dt className="text-muted-foreground">License</dt><dd>{license}</dd></div>
            <div><dt className="text-muted-foreground">Rights confirmed</dt><dd>{l.copyright_declared_at ? "Yes" : "No"}</dd></div>
          </dl>
          {l.topic || l.learning_competency ? (
            <p className="text-sm"><span className="text-muted-foreground">Topic and competency:</span> {[l.topic, l.learning_competency].filter(Boolean).join(" · ")}</p>
          ) : null}
          <div>
            <h3 className="mb-1 text-sm font-semibold">Description</h3>
            <p className="whitespace-pre-line text-sm">{l.description}</p>
          </div>
          {l.license_terms ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Extra license terms</h3>
              <p className="whitespace-pre-line text-sm">{l.license_terms}</p>
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <div>
            <h2 className="font-display text-xl font-bold">Files</h2>
            <p className="text-sm text-muted-foreground">
              Download each file, open it on a safe computer, and check it is what the listing describes and doesn&apos;t copy
              DepEd modules, textbooks or other sellers&apos; work. Every download is logged.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-[10px] border border-border" data-testid="review-files">
            {l.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <a href={`/admin/files/${f.id}`} className="font-semibold text-primary hover:underline">{f.original_filename}</a>
                  <p className="text-xs text-muted-foreground">{f.file_format.toUpperCase()} · {size(f.size_bytes)}</p>
                </div>
                <FileCheck productId={l.id} fileId={f.id} name={f.original_filename} status={f.scan_status} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h2 className="font-display text-xl font-bold">Preview images</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {l.previews.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-[10px] border border-border bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicObjectUrl("product-previews", p.storage_path)} alt="Seller preview" className="aspect-[4/3] w-full object-cover" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-3 p-6">
          <h2 className="font-display text-xl font-bold">Seller</h2>
          <p className="font-semibold">{l.shop.name}</p>
          <p className="text-sm capitalize text-muted-foreground">
            {l.shop.seller_type} · account {l.shop.seller_status} · shop {l.shop.is_published ? "published" : "not published"}
          </p>
          {l.shop.strikes > 0 ? <p className="text-sm font-semibold text-danger">{l.shop.strikes} copyright strike{l.shop.strikes > 1 ? "s" : ""}</p> : null}
          {shopOpens ? <p className="rounded-[10px] bg-accent-soft p-3 text-sm">Approving this listing also opens this seller&apos;s shop. Payouts still wait for identity verification.</p> : null}
        </Card>
        {l.status === "pending_review" ? (
          <Card className="p-6 lg:sticky lg:top-6">
            <DecisionForm action={reviewListing.bind(null, l.id)} unchecked={unchecked} />
          </Card>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">This listing is not waiting for review.</Card>
        )}
      </div>
    </div>
  );
}
