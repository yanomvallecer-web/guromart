import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu, AccountMenuFallback } from "./account-menu";
import { CartLink } from "./cart-link";
import { Logo } from "./logo";
import { SearchForm } from "./search-form";

/** One row: logo and search on phones (the tab bar has the rest); the full menu from md up. */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5 sm:px-6 md:gap-4 md:py-3">
        <Logo />
        <SearchForm className="flex-1" placeholder="Search lesson plans, DLL…" />
        <nav aria-label="Main" className="hidden items-center gap-1 text-[15px] font-semibold md:flex">
          <Link href="/browse" className="rounded-[10px] px-3 py-2.5 hover:bg-surface-muted">
            Browse
          </Link>
          <Link href="/sell" className="rounded-[10px] px-3 py-2.5 hover:bg-surface-muted">
            Sell
          </Link>
          <Suspense fallback={null}>
            <CartLink />
          </Suspense>
          <Suspense fallback={<AccountMenuFallback />}>
            <AccountMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
