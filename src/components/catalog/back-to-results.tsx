"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const HERE = "gm.nav.here";
const PREV = "gm.nav.prev";

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Remembers this tab's current and previous page (path and query only, no
 * personal data), so a resource page can link back to the exact search the
 * visitor came from. Lives in the root layout.
 */
export function NavMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;
    try {
      const here = sessionStorage.getItem(HERE);
      if (here === url) return;
      if (here) sessionStorage.setItem(PREV, here);
      sessionStorage.setItem(HERE, url);
    } catch {
      // Storage blocked: the link falls back to Browse.
    }
  }, [pathname, search]);
  return null;
}

const noop = () => () => {};

/** The browse page this one was reached from, or null. */
function cameFrom(): string | null {
  const url = location.pathname + location.search;
  // Before NavMemory records this page, "here" is still the page we came from.
  const from = read(HERE) === url ? read(PREV) : read(HERE);
  return from && /^\/browse(\?|$)/.test(from) ? from : null;
}

/**
 * "Back to results" when the visitor arrived from search or browse, so their
 * words and filters come back with them; otherwise a plain link to Browse.
 */
export function BackToResults() {
  const back = useSyncExternalStore(noop, cameFrom, () => null);
  return (
    <Link href={back ?? "/browse"} className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      {back ? "Back to results" : "Browse all resources"}
    </Link>
  );
}
