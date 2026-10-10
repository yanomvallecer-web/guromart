"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Label, Textarea } from "@/components/ui/form";
import { type ReviewFormState, deleteReview, replyToReview, saveReview } from "@/app/resources/actions";

export function ReviewForm({ productId, slug, existing }: { productId: string; slug: string; existing: { rating: number; body: string | null } | null }) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(saveReview.bind(null, productId, slug), {});
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Submitted by hand so React doesn't reset the form afterwards and clear the chosen stars.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      {removeError ? <FormAlert>{removeError}</FormAlert> : null}
      {state.ok ? <FormAlert tone="success">Thanks, your review is posted.</FormAlert> : null}
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className="cursor-pointer rounded-[8px] p-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
              <input type="radio" name="rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="sr-only" />
              <Star aria-hidden className={`size-7 ${i <= rating ? "fill-accent text-accent" : "text-muted-foreground"}`} />
              <span className="sr-only">{i} {i === 1 ? "star" : "stars"}</span>
            </label>
          ))}
        </div>
        <FieldError id="rating-error" messages={state.fieldErrors?.rating} />
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-body">What worked in your class? (optional)</Label>
        <Textarea id="review-body" name="body" rows={3} maxLength={2000} defaultValue={existing?.body ?? ""} />
        <FieldError id="body-error" messages={state.fieldErrors?.body} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || rating === 0}>{pending ? "Saving…" : existing ? "Update review" : "Post review"}</Button>
        {existing ? (
          <Button
            type="button"
            variant="ghost"
            disabled={removing}
            onClick={() =>
              startRemove(async () => {
                const r = await deleteReview(productId, slug);
                setRemoveError(r.error ?? null);
                if (!r.error) setRating(0);
              })
            }
          >
            {removing ? "Removing…" : "Remove my review"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ReplyForm({ reviewId, slug, existing }: { reviewId: string; slug: string; existing: string | null }) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(replyToReview.bind(null, reviewId, slug), {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div>
        <Button type="button" variant="link" size="sm" className="h-9 px-0" onClick={() => setOpen(true)}>
          {existing ? "Edit your reply" : "Reply as the seller"}
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Label htmlFor={`reply-${reviewId}`}>Your public reply</Label>
      <Textarea id={`reply-${reviewId}`} name="reply" rows={2} maxLength={1000} defaultValue={existing ?? ""} />
      <FieldError id={`reply-${reviewId}-error`} messages={state.fieldErrors?.reply} />
      <p className="text-xs text-muted-foreground">Leave it empty and save to remove your reply.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save reply"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
