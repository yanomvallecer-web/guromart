"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Logo } from "./logo";

/** Shared layout: keep navigation independent of each page's server data. */
export function HeaderChrome({ children, className }: { children: ReactNode; className: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const history = useRef<{ current: string | null; previous: string | null }>({ current: null, previous: null });
  useEffect(() => {
    if (history.current.current !== pathname) {
      history.current = { previous: history.current.current, current: pathname };
    }
  }, [pathname]);
  const resource = pathname.startsWith("/resources/");

  return (
    <header data-site-header className={className}>
      <div className={resource ? "hidden md:block" : undefined}>{children}</div>
      {resource ? (
        <nav aria-label="Resource navigation" className="grid h-16 grid-cols-[76px_1fr_76px] items-center gap-2 px-3 md:hidden">
          <Link href="/browse" aria-label="Back to resources" className="flex min-h-11 items-center justify-center gap-1 rounded-full px-2 text-sm font-semibold hover:bg-surface-muted" onClick={event => {
            // Only go back when this persistent layout saw the previous in-app page.
            // A direct visit (or JavaScript disabled) always has a working catalog link.
            if (history.current.previous && !/^\/(sign-in|auth)(\/|$)/.test(history.current.previous) && window.history.length > 1 && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              router.back();
            }
          }}>
            <ArrowLeft className="size-[18px]" aria-hidden /> <span>Back</span>
          </Link>
          <div className="justify-self-center [&_svg]:size-8 [&_span]:text-lg"><Logo showWordmark /></div>
          <Link href="/browse" aria-label="Browse resources" className="flex size-11 items-center justify-center justify-self-end rounded-full hover:bg-surface-muted"><Search className="size-5" aria-hidden /></Link>
        </nav>
      ) : null}
    </header>
  );
}
