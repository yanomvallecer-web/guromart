"use client";

import { useRef } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

/**
 * One-line sort menu. A <details> list of links, so it works without
 * JavaScript; with it, choosing an option or pressing Escape closes it.
 */
export function SortMenu({ current, options }: { current: string; options: { label: string; href: string; active: boolean }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  return (
    <details
      ref={ref}
      className="group relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) {
          close();
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-[10px] px-2 text-sm font-semibold text-foreground hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">Sort:</span> {current}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-56 rounded-[12px] border border-border bg-surface p-1.5 shadow-lg">
        {options.map((o) => (
          <li key={o.href}>
            <Link
              href={o.href}
              onClick={close}
              aria-current={o.active ? "true" : undefined}
              className="flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-sm font-medium hover:bg-surface-muted aria-[current=true]:font-bold aria-[current=true]:text-primary"
            >
              {o.label}
              {o.active ? <Check className="size-4" aria-hidden /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
