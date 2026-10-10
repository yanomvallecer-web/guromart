"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

export type GalleryImage = { src: string; alt: string };

/** A large preview with the rest as small slides underneath. Tap a slide, use the arrows or swipe to change it. */
export function PreviewGallery({ images }: { images: GalleryImage[] }) {
  const [current, setCurrent] = useState(0);
  const touchX = useRef<number | null>(null);
  const many = images.length > 1;
  const go = (i: number) => setCurrent((i + images.length) % images.length);
  const shown = images[current];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const keys = (e: React.KeyboardEvent) => {
    if (!many) return;
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
  };
  const arrow = (dir: "prev" | "next", className = "") => (
    <button
      type="button"
      onClick={() => go(dir === "next" ? current + 1 : current - 1)}
      aria-label={dir === "next" ? "Next preview" : "Previous preview"}
      className={`absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/95 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-primary ${dir === "next" ? "right-2" : "left-2"} ${className}`}
    >
      {dir === "next" ? <ChevronRight className="size-5" aria-hidden /> : <ChevronLeft className="size-5" aria-hidden />}
    </button>
  );

  return (
    <div className="flex flex-col gap-2" data-testid="preview-gallery" onKeyDown={keys}>
      <div
        className="relative"
        onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (!many || start == null || end == null || Math.abs(end - start) < 40) return;
          go(end < start ? current + 1 : current - 1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown.src}
          alt={shown.alt}
          className="mx-auto block h-auto max-h-[60dvh] w-full rounded-[12px] border border-border bg-surface object-contain lg:max-h-[70dvh]"
        />
        {many ? (
          <>
            <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2.5 py-0.5 text-xs font-bold shadow-sm" aria-live="polite">
              Preview {current + 1} of {images.length}
            </span>
            {arrow("prev")}
            {arrow("next")}
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setZoomed(true);
            dialogRef.current?.showModal();
          }}
          className="absolute bottom-2 right-2 flex min-h-11 items-center gap-1.5 rounded-full bg-foreground/85 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Maximize2 className="size-4" aria-hidden /> Enlarge
        </button>
      </div>

      {/* Full-screen view: the image at its own size, scrollable when larger than the screen. */}
      <dialog
        ref={dialogRef}
        aria-label={`Preview ${current + 1} of ${images.length}, enlarged`}
        onKeyDown={keys}
        onClose={() => setZoomed(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-foreground/95 p-0 backdrop:bg-foreground/60 open:flex open:flex-col"
      >
        {zoomed ? (
          <>
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-white">
          <span className="text-sm font-semibold">
            Preview {current + 1} of {images.length}
          </span>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close enlarged preview"
            className="flex size-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown.src} alt={shown.alt} className="mx-auto block h-auto w-full max-w-[1400px] object-contain" />
        </div>
        {many ? (
          <div className="flex items-center justify-center gap-4 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => go(current - 1)} aria-label="Previous preview" className="flex size-11 items-center justify-center rounded-full bg-surface text-foreground">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => go(current + 1)} aria-label="Next preview" className="flex size-11 items-center justify-center rounded-full bg-surface text-foreground">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        ) : null}
          </>
        ) : null}
      </dialog>

      {many ? (
        <ul aria-label="All previews" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {images.map((img, i) => (
            <li key={img.src} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Show preview ${i + 1}`}
                aria-current={i === current ? "true" : undefined}
                className={`block w-24 overflow-hidden rounded-[8px] border-2 bg-surface sm:w-28 ${
                  i === current ? "border-primary" : "border-border opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt="" loading="lazy" className="aspect-[4/3] w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
