"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * A <details> dropdown that closes itself once something in it is chosen,
 * when the page changes, on a tap outside it, or on Escape. Without
 * JavaScript it is still a plain <details> that opens and closes.
 */
export function MenuDetails({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details
      ref={ref}
      className={className}
      onClick={(e) => {
        // A link or button inside the open panel (not the summary that toggles it).
        const target = (e.target as HTMLElement).closest("a, button");
        if (target && ref.current?.open && !target.closest("summary")) ref.current.open = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      {children}
    </details>
  );
}
