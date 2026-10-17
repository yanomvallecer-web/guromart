"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import type { PreviewableFormat } from "@/lib/listings/page-images";
import { ownFileUrl } from "../actions";
import { uploadAll } from "./upload-all";

const IS_PICTURE = new Set(["png", "jpg", "webp"]);

function pageWord(format: string, n: number) {
  if (IS_PICTURE.has(format)) return "a preview";
  const word = format === "pptx" ? "slide" : "page";
  return n === 1 ? `a ${word}` : `${n} ${word}s`;
}

/**
 * Draws the first pages of a PDF, Word file or PowerPoint (or a smaller marked
 * copy of an image) in this browser and adds them as ordinary preview images,
 * filling the free preview places. When the listing already has a cover, page 1
 * is skipped since it's usually that cover. Returns one message per problem; the
 * seller removes any page they don't want shown.
 */
export async function addPagePreviews(
  listingId: string,
  file: Blob,
  name: string,
  format: PreviewableFormat,
  slots: number,
  setProgress: (p: string) => void,
  hasCover: boolean,
): Promise<string[]> {
  if (slots <= 0) return [];
  setProgress("Making previews…");
  try {
    const { renderPageImages } = await import("@/lib/listings/page-images");
    const { images } = await renderPageImages(
      file,
      format,
      slots,
      (done, total) => setProgress(`Making previews (${Math.min(done + 1, total)} of ${total})…`),
      hasCover ? 1 : 0,
    );
    const base = name.replace(/\.[a-z0-9]+$/i, "");
    const files = images.map((img) => new File([img.blob], `${base}-page-${img.index + 1}.jpg`, { type: "image/jpeg" }));
    images.forEach((img) => URL.revokeObjectURL(img.url));
    if (!files.length) return [`${name}: we couldn't find any pages to show.`];
    return await uploadAll(listingId, "preview", files, setProgress);
  } catch {
    return [`${name}: we couldn't draw its pages. You can still add preview images yourself.`];
  }
}

type SourceFile = { id: string; name: string; format: PreviewableFormat };

/** For files already on the listing: one click adds their first pages as previews. */
export function PreviewMaker({ listingId, slotsLeft, sources, hasCover }: { listingId: string; slotsLeft: number; sources: SourceFile[]; hasCover: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  if (slotsLeft <= 0 || !sources.length) return null;

  async function make(source: SourceFile) {
    setErrors([]);
    setStatus("Opening your file…");
    const link = await ownFileUrl(listingId, source.id);
    let failed: string[];
    if (!link.ok) failed = [link.error];
    else {
      try {
        const res = await fetch(link.url);
        if (!res.ok) throw new Error(String(res.status));
        failed = await addPagePreviews(listingId, await res.blob(), source.name, source.format, slotsLeft, setStatus, hasCover);
      } catch {
        failed = [`${source.name}: we couldn't open it. Check your connection and try again.`];
      }
    }
    setStatus(null);
    setErrors(failed);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-border p-4" data-testid="preview-maker">
      <p className="text-sm text-muted-foreground">
        Make previews from your files. They&apos;re drawn in your browser, so fonts can look a little different; remove any page you don&apos;t want
        buyers to see.
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
        {sources.map((s) => (
          <Button key={s.id} type="button" variant="outline" disabled={status !== null} onClick={() => void make(s)}>
            <FileImage aria-hidden /> Add {pageWord(s.format, slotsLeft)} from {s.name}
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
