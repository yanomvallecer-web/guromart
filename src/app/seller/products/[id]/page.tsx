import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { getTaxonomy } from "@/lib/catalog/queries";
import { reviewProblems } from "@/lib/listings/schema";
import { getOwnListing, getSellerContext } from "@/lib/listings/seller";
import { LISTING_STATUS } from "@/lib/listings/status";
import { publicObjectUrl } from "@/lib/storage";
import { saveListing } from "../actions";
import { ListingControls } from "./listing-controls";
import { ListingForm } from "./listing-form";
import { MediaManager } from "./media-manager";

export const metadata: Metadata = { title: "Edit resource" };

export default function EditListingPage(props: PageProps<"/seller/products/[id]">) {
  return (
    <PageShell
      title="Edit resource"
      actions={
        <Link href="/seller/products" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> All resources
        </Link>
      }
    >
      <Suspense fallback={<PanelSkeleton />}>
        <EditListing params={props.params} />
      </Suspense>
    </PageShell>
  );
}

const MEDIA_EDITABLE = new Set(["draft", "rejected", "pending_review"]);

async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireArea("seller", `/seller/products/${id}`);
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  const [listing, taxonomy] = await Promise.all([getOwnListing(ctx.storefront.id, id), getTaxonomy()]);
  const status = LISTING_STATUS[listing.status] ?? LISTING_STATUS.draft;
  const codeOf = (list: { id: number; code: string }[], value: number | null) => list.find((i) => i.id === value)?.code ?? "";
  const problems = reviewProblems({
    title: listing.title,
    description: listing.description,
    category_id: listing.category_id,
    subject_id: listing.subject_id,
    grade_count: listing.grade_ids.length,
    file_count: listing.files.length,
    preview_count: listing.previews.length,
    copyright_declared: Boolean(listing.copyright_declared_at),
  });
  const pick = (items: { code: string; name: string }[]) => items.map(({ code, name }) => ({ code, name }));

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <ListingForm
            action={saveListing.bind(null, listing.id)}
            readOnly={listing.status === "suspended"}
            options={{
              categories: pick(taxonomy.categories),
              subjects: pick(taxonomy.subjects),
              grades: pick(taxonomy.grades),
              curricula: pick(taxonomy.curricula),
              periods: pick(taxonomy.periods),
              languages: taxonomy.languages,
            }}
            values={{
              title: listing.title,
              summary: listing.summary ?? "",
              description: listing.description,
              category: codeOf(taxonomy.categories, listing.category_id),
              subject: codeOf(taxonomy.subjects, listing.subject_id),
              curriculum: codeOf(taxonomy.curricula, listing.curriculum_id),
              period: codeOf(taxonomy.periods, listing.academic_period_id),
              period_detail: listing.period_detail ?? "",
              topic: listing.topic ?? "",
              learning_competency: listing.learning_competency ?? "",
              language: listing.language_code ?? "",
              grades: listing.grade_ids.map((g) => codeOf(taxonomy.grades, g)).filter(Boolean),
              price: listing.price_centavos % 100 === 0 ? String(listing.price_centavos / 100) : (listing.price_centavos / 100).toFixed(2),
              page_count: listing.page_count ? String(listing.page_count) : "",
              is_editable: listing.is_editable,
              license_type: listing.license_type,
              license_terms: listing.license_terms ?? "",
              copyright_declared: Boolean(listing.copyright_declared_at),
            }}
            liveWarning={listing.status === "published"}
            saveLabel={["draft", "rejected"].includes(listing.status) ? "Save draft" : "Save changes"}
            // A new draft starts with its file; after that, with the details.
            initialStep={listing.files.length ? "details" : "file"}
            fileStep={
              <MediaManager
                listingId={listing.id}
                editable={MEDIA_EDITABLE.has(listing.status)}
                files={listing.files}
                previews={listing.previews.map((p) => ({ id: p.id, url: publicObjectUrl("product-previews", p.storage_path), alt: p.alt_text }))}
              />
            }
          />
        </Card>
      </div>
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-6 lg:sticky lg:top-6">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge className={`mt-1 ${status.tone}`} data-testid="listing-status">{status.label}</Badge>
            <p className="mt-2 text-sm text-muted-foreground">{status.hint}</p>
          </div>
          {listing.status === "rejected" && listing.rejection_reason ? (
            <div className="rounded-[10px] bg-danger-soft p-3 text-sm text-danger">
              <p className="font-semibold">Reviewer notes</p>
              <p>{listing.rejection_reason}</p>
            </div>
          ) : null}
          {["draft", "rejected"].includes(listing.status) ? (
            problems.length ? (
              <div className="text-sm">
                <p className="font-semibold">Before you can submit</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-success">Ready to submit for review.</p>
            )
          ) : null}
          {listing.status === "published" ? (
            <Link href={`/resources/${listing.slug}`} className="text-sm font-semibold text-primary hover:underline">
              View the live page
            </Link>
          ) : null}
          <ListingControls listingId={listing.id} status={listing.status} ready={problems.length === 0} />
        </Card>
      </div>
    </div>
  );
}
