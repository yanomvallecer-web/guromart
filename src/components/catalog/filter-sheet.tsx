"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/** The form's values as a clean /browse query: empty choices and the page number are left out. */
function queryOf(form: HTMLFormElement): string {
  const qs = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string" && value !== "" && key !== "page") qs.set(key, value);
  }
  return qs.toString();
}

/**
 * Phone and tablet filters: a "Filters" button that opens a bottom sheet.
 *
 * Without JavaScript the button is a link to #filters and the sheet shows
 * through the :target selector; the form inside is a plain GET form to
 * /browse, so filtering still works. With JavaScript the sheet is a modal
 * dialog (focus stays inside, Escape and the backdrop close it, focus returns
 * to the button) and the apply button shows the live result count from
 * /api/browse-count, which runs the same database search as the page.
 */
export function FilterSheet({
  activeCount,
  total,
  clearHref,
  children,
}: {
  activeCount: number;
  /** Results for the filters currently applied (the page's own count). */
  total: number;
  clearHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef<AbortController>(undefined);
  const [count, setCount] = useState<number | null>(total);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );

  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const recount = () => {
    const form = formRef.current;
    if (!form) return;
    setCount(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const res = await fetch(`/api/browse-count?${queryOf(form)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { total: number };
        setCount(typeof body.total === "number" ? body.total : null);
      } catch (err) {
        // Leave the button as "Show resources"; applying still works.
        if ((err as Error).name !== "AbortError") setCount(null);
      }
    }, 250);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    for (const input of form.querySelectorAll<HTMLInputElement>('input[type="radio"][value=""]')) input.checked = true;
    for (const select of form.querySelectorAll<HTMLSelectElement>("select")) select.value = "";
    recount();
  };

  const apply = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const qs = queryOf(e.currentTarget);
    close();
    router.push(qs ? `/browse?${qs}` : "/browse");
  };

  const label = hydrated && count !== null ? `Show ${count} ${count === 1 ? "resource" : "resources"}` : "Show resources";

  return (
    <>
      <a
        ref={triggerRef}
        href="#filters"
        onClick={hydrated ? open : undefined}
        aria-haspopup="dialog"
        className={cn(buttonVariants({ variant: "dark" }), "rounded-full lg:hidden")}
      >
        <SlidersHorizontal aria-hidden /> {activeCount ? `Filters · ${activeCount}` : "Filters"}
      </a>

      <dialog
        ref={dialogRef}
        id="filters"
        aria-labelledby="filters-h"
        onClose={() => triggerRef.current?.focus()}
        onClick={(e) => {
          // A click on the dialog itself (not its contents) is a click on the backdrop.
          if (e.target === dialogRef.current) close();
        }}
        className="inset-x-0 bottom-0 top-auto z-40 m-0 hidden max-h-[88dvh] w-full max-w-none flex-col rounded-t-[20px] bg-surface p-0 text-foreground shadow-2xl backdrop:bg-foreground/50 target:fixed target:flex open:flex motion-safe:open:animate-sheet-up lg:mx-auto lg:max-w-xl"
      >
        <form ref={formRef} action="/browse" onSubmit={hydrated ? apply : undefined} onChange={hydrated ? recount : undefined} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 id="filters-h" className="font-display text-xl font-bold">Filters</h2>
            <div className="flex items-center gap-1">
              <a href={clearHref} onClick={hydrated ? clearAll : undefined} className="rounded-[10px] px-3 py-2.5 text-sm font-semibold text-primary hover:underline">
                Clear all
              </a>
              {hydrated ? (
                <button type="button" onClick={close} aria-label="Close filters" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                  <X aria-hidden />
                </button>
              ) : (
                <a href="#results-h" aria-label="Close filters" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                  <X aria-hidden />
                </a>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5">{children}</div>
          <div className="border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="submit" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
              {label}
            </button>
            <p className="sr-only" aria-live="polite">
              {hydrated && count !== null ? `${count} ${count === 1 ? "resource matches" : "resources match"}` : ""}
            </p>
          </div>
        </form>
      </dialog>
    </>
  );
}
