"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type GalleryImage = { src: string; alt: string };

/** A large preview with the rest as small slides underneath. Tap a slide, use the arrows or swipe to change it. */
export function PreviewGallery({ images }: { images: GalleryImage[] }) {
  const [current, setCurrent] = useState(0);
  const touchX = useRef<number | null>(null);
  const many = images.length > 1;
  const go = (i: number) => setCurrent((i + images.length) % images.length);
  const shown = images[current];

  return (
    <div className="flex flex-col gap-2" data-testid="preview-gallery">
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
          className="aspect-[4/3] max-h-[60dvh] w-full rounded-[12px] border border-border bg-surface object-contain lg:max-h-[70dvh]"
        />
        {many ? (
          <>
            <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2.5 py-0.5 text-xs font-bold shadow-sm" aria-live="polite">
              Preview {current + 1} of {images.length}
            </span>
            <button
              type="button"
              onClick={() => go(current - 1)}
              aria-label="Previous preview"
              className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/95 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(current + 1)}
              aria-label="Next preview"
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/95 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

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
