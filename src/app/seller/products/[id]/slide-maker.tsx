"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import type { SlideImage } from "@/lib/listings/slide-images";
import { uploadAll } from "./upload-all";

/** Slides drawn per file; enough to choose from without a long wait on a phone. */
const SLIDES_TO_DRAW = 12;

/**
 * Draws the first slides of a PowerPoint as pictures in this browser, lets the
 * seller tick the ones to show, and uploads those as ordinary preview images.
 * The .pptx itself is read locally and never uploaded by this step.
 */
export function SlideMaker({ listingId, slotsLeft }: { listingId: string; slotsLeft: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string[]>([]);
  const [deck, setDeck] = useState<{ name: string; total: number; images: SlideImage[] } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => () => deck?.images.forEach((img) => URL.revokeObjectURL(img.url)), [deck]);

  async function read(file: File) {
    setError([]);
    setDeck(null);
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      setError(["Choose a PowerPoint file that ends in .pptx."]);
      return;
    }
    setStatus("Opening your slides…");
    try {
      const { renderSlideImages } = await import("@/lib/listings/slide-images");
      const result = await renderSlideImages(file, SLIDES_TO_DRAW, (done, total) => setStatus(`Drawing slide ${Math.min(done + 1, total)} of ${total}…`));
      if (!result.images.length) throw new Error("no slides");
      setDeck({ name: file.name.replace(/\.pptx$/i, ""), ...result });
      setPicked(result.images.slice(0, slotsLeft).map((img) => img.index));
    } catch {
      setError(["We couldn't read that PowerPoint. Try saving it again as .pptx, or export the slides as pictures and add them above."]);
    } finally {
      setStatus(null);
      if (input.current) input.current.value = "";
    }
  }

  async function add() {
    if (!deck) return;
    const files = deck.images
      .filter((img) => picked.includes(img.index))
      .map((img) => new File([img.blob], `${deck.name}-slide-${img.index + 1}.jpg`, { type: "image/jpeg" }));
    const failed = await uploadAll(listingId, "preview", files, setStatus);
    setStatus(null);
    setError(failed);
    if (!failed.length) setDeck(null);
    router.refresh();
  }

  function toggle(index: number) {
    setPicked((p) => (p.includes(index) ? p.filter((i) => i !== index) : p.length < slotsLeft ? [...p, index].sort((a, b) => a - b) : p));
  }

  if (slotsLeft <= 0) return null;
  const busy = status !== null;

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-border p-4" data-testid="slide-maker">
      <div>
        <p className="font-semibold">Selling a PowerPoint?</p>
        <p className="text-sm text-muted-foreground">
          Pick the .pptx and we&apos;ll draw its first slides as preview pictures. Your file stays on this device for this step.
        </p>
      </div>
      {error.length ? (
        <FormAlert>
          <ul className="list-disc pl-4">
            {error.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </FormAlert>
      ) : null}
      <input
        ref={input}
        id="slides-from-pptx"
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className={busy ? "pointer-events-none opacity-60" : "cursor-pointer"}>
          <label htmlFor="slides-from-pptx">
            <Presentation aria-hidden /> Make previews from a PowerPoint
          </label>
        </Button>
        {status ? (
          <span role="status" className="text-sm text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>

      {deck ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Tick up to {slotsLeft} {slotsLeft === 1 ? "slide" : "slides"} to show buyers.
            {deck.total > deck.images.length ? ` Showing the first ${deck.images.length} of ${deck.total} slides.` : ""} These are drawn in
            your browser, so fonts or effects can look a little different from PowerPoint. Leave out answer keys and any slide that looks wrong.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Slides from your PowerPoint">
            {deck.images.map((img) => {
              const on = picked.includes(img.index);
              const full = !on && picked.length >= slotsLeft;
              return (
                <li key={img.index}>
                  <label className={`flex cursor-pointer flex-col gap-1 rounded-[10px] border-2 p-1 ${on ? "border-primary" : "border-border"} ${full ? "opacity-50" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`Slide ${img.index + 1}`} className="aspect-video w-full rounded-[6px] bg-white object-contain" />
                    <span className="flex items-center gap-2 px-1 pb-1 text-sm">
                      <input type="checkbox" checked={on} disabled={full || busy} onChange={() => toggle(img.index)} className="size-4 accent-[var(--color-primary)]" />
                      Slide {img.index + 1}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!picked.length || busy} onClick={() => void add()}>
              Add {picked.length} {picked.length === 1 ? "slide" : "slides"} as previews
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeck(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
