import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-semibold text-foreground">GuroMart</span> · Everything You Need to Teach, All in One Place.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/browse" className="hover:text-foreground">Browse</Link>
          <Link href="/sell" className="hover:text-foreground">Sell on GuroMart</Link>
        </nav>
      </div>
      <p className="mx-auto max-w-[1200px] px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        GuroMart is an independent marketplace and is not the official DepEd website.
      </p>
    </footer>
  );
}
