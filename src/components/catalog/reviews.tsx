import { MessageSquare, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/dal";
import { getProductAccess } from "@/lib/commerce/cart";
import { createClient } from "@/lib/supabase/server";
import { ReplyForm, ReviewForm } from "./review-forms";

type ReviewRow = { id: string; rating: number; body: string | null; created_at: string; reviewer: string; seller_reply: string | null; seller_replied_at: string | null };

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

export function Stars({ rating, className = "size-4" }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`${className} ${i <= rating ? "fill-accent text-accent" : "text-border"}`} />
      ))}
    </span>
  );
}

/**
 * Reviews of a resource. Only teachers with it in their library (bought or
 * free) can write one, one each, and the seller can reply publicly.
 */
export async function ReviewsSection({ productId, slug }: { productId: string; slug: string }) {
  const supabase = await createClient();
  const viewer = await getViewer();
  const [{ data, error }, access] = await Promise.all([
    supabase.rpc("product_reviews", { p_product_id: productId }),
    viewer ? getProductAccess(viewer, productId) : Promise.resolve("none" as const),
  ]);
  if (error) throw new Error(`Could not load reviews: ${error.message}`);
  const reviews = (data ?? []) as ReviewRow[];
  const mine =
    viewer && access === "owned"
      ? (await supabase.from("reviews").select("rating, body, status").eq("product_id", productId).eq("user_id", viewer.id).maybeSingle()).data
      : null;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section aria-labelledby="reviews-heading" data-testid="reviews" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="reviews-heading" className="font-display text-xl font-bold">Reviews</h2>
        {reviews.length ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Stars rating={Math.round(avg)} /> {avg.toFixed(1)} from {reviews.length} {reviews.length === 1 ? "teacher" : "teachers"}
          </p>
        ) : null}
      </div>

      {access === "owned" ? (
        <Card className="p-4 sm:p-5">
          <h3 className="mb-3 font-semibold">{mine ? "Your review" : "Rate this resource"}</h3>
          {mine?.status === "hidden" ? <p className="mb-3 text-sm text-danger">GuroMart staff hid this review. You can edit it or remove it.</p> : null}
          <ReviewForm productId={productId} slug={slug} existing={mine ? { rating: mine.rating, body: mine.body } : null} />
        </Card>
      ) : access === "none" || access === "in_cart" ? (
        <p className="text-sm text-muted-foreground">Only teachers who have this resource in their library can review it, so every review comes from someone who used it.</p>
      ) : null}

      {reviews.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden /> No reviews yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-4 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars rating={r.rating} />
                <span className="text-sm font-semibold">{r.reviewer}</span>
                <span className="text-sm text-muted-foreground">{dateFmt.format(new Date(r.created_at))}</span>
              </div>
              {r.body ? <p className="whitespace-pre-line text-[15px]">{r.body}</p> : null}
              {r.seller_reply ? (
                <div className="mt-1 rounded-[10px] border-l-4 border-primary bg-surface-muted px-3 py-2 text-sm">
                  <p className="font-semibold">Reply from the seller</p>
                  <p className="whitespace-pre-line">{r.seller_reply}</p>
                </div>
              ) : null}
              {access === "owner" ? <ReplyForm reviewId={r.id} slug={slug} existing={r.seller_reply} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
