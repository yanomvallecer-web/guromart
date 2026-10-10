"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { ownPowerPointUrl } from "../actions";
import { uploadAll } from "./upload-all";

/**
 * Draws the first slides of a PowerPoint as pictures in this browser and adds
 * them as ordinary preview images, filling the free preview places. When the
 * listing already has a cover, slide 1 is skipped since it's usually that cover.
 * Returns one message per problem; the seller removes any slide they don't want shown.
 */
export async function addSlidePreviews(
  listingId: string,
  deck: Blob,
  name: string,
  slots: number,
  setProgress: (p: string) => void,
  hasCover: boolean,
): Promise<string[]> {
  if (slots <= 0) return [];
  setProgress("Making slide previews…");
  try {
    const { renderSlideImages } = await import("@/lib/listings/slide-images");
    const { images } = await renderSlideImages(
      deck,
      slots,
      (done, total) => setProgress(`Making slide previews (${Math.min(done + 1, total)} of ${total})…`),
      hasCover ? 1 : 0,
    );
    const base = name.replace(/\.pptx$/i, "");
    const files = images.map((img) => new File([img.blob], `${base}-slide-${img.index + 1}.jpg`, { type: "image/jpeg" }));
    images.forEach((img) => URL.revokeObjectURL(img.url));
    if (!files.length) return [`${name}: we couldn't find any slides to show.`];
    return await uploadAll(listingId, "preview", files, setProgress);
  } catch {
    return [`${name}: we couldn't draw its slides. You can still add preview images yourself.`];
  }
}

/** For PowerPoints already on the listing: one click adds their first slides as previews. */
export function SlideMaker({ listingId, slotsLeft, decks, hasCover }: { listingId: string; slotsLeft: number; decks: { id: string; name: string }[]; hasCover: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  if (slotsLeft <= 0 || !decks.length) return null;

  async function make(deck: { id: string; name: string }) {
    setErrors([]);
    setStatus("Opening your slides…");
    const link = await ownPowerPointUrl(listingId, deck.id);
    let failed: string[];
    if (!link.ok) failed = [link.error];
    else {
      try {
        const res = await fetch(link.url);
        if (!res.ok) throw new Error(String(res.status));
        failed = await addSlidePreviews(listingId, await res.blob(), deck.name, slotsLeft, setStatus, hasCover);
      } catch {
        failed = [`${deck.name}: we couldn't open it. Check your connection and try again.`];
      }
    }
    setStatus(null);
    setErrors(failed);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-border p-4" data-testid="slide-maker">
      <p className="text-sm text-muted-foreground">
        Add {slotsLeft === 1 ? "a slide" : `${slotsLeft} slides`} from your PowerPoint as previews. They&apos;re drawn in your browser, so fonts can look a
        little different; remove any slide you don&apos;t want buyers to see.
      </p>
      {errors.length ? (
        <FormAlert>
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </FormAlert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {decks.map((d) => (
          <Button key={d.id} type="button" variant="outline" disabled={status !== null} onClick={() => void make(d)}>
            <Presentation aria-hidden /> Add slides from {d.name}
          </Button>
        ))}
        {status ? (
          <span role="status" className="text-sm text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>
    </div>
  );
}
