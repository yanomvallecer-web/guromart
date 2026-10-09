import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu, AccountMenuFallback } from "./account-menu";
import { Logo } from "./logo";
import { SearchForm } from "./search-form";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />
        <SearchForm className="order-last w-full sm:order-none sm:w-auto sm:flex-1" />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-[15px] font-semibold sm:ml-0">
          <Link href="/browse" className="rounded-[10px] px-3 py-2.5 hover:bg-surface-muted">
            Browse
          </Link>
          <Link href="/sell" className="rounded-[10px] px-3 py-2.5 hover:bg-surface-muted">
            Sell
          </Link>
          <Suspense fallback={<AccountMenuFallback />}>
            <AccountMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
