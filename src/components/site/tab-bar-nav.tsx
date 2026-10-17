"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, BookOpen, Home, LayoutGrid, ShoppingCart } from "lucide-react";

/** Pages that put their own action bar (price and buy button) in the tab bar's place. */
const OWN_BOTTOM_BAR = ["/resources/"];

const signInFor = (path: string) => `/sign-in?next=${encodeURIComponent(path)}`;

/**
 * Phone navigation fixed to the bottom of the screen. Signed-out visitors'
 * Saved, Library and Cart tabs go to sign-in and come back afterwards.
 */
export function TabBarNav({ signedIn, cartCount }: { signedIn: boolean; cartCount: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const saved = pathname === "/library" && searchParams.get("tab") === "saved";
  if (OWN_BOTTOM_BAR.some((p) => pathname.startsWith(p))) return null;

  const under = (...prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const tabs = [
    { label: "Home", href: "/", icon: Home, active: pathname === "/" },
    { label: "Browse", href: "/browse", icon: LayoutGrid, active: under("/browse", "/shop") },
    { label: "Saved", href: !signedIn ? signInFor("/library?tab=saved") : "/library?tab=saved", icon: Bookmark, active: saved },
    { label: "Library", href: !signedIn ? signInFor("/library") : "/library", icon: BookOpen, active: under("/library") && !saved },
    { label: "Cart", href: !signedIn ? signInFor("/cart") : "/cart", icon: ShoppingCart, active: under("/cart"), badge: cartCount },
  ];

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {/* Equal columns for however many tabs show: the Android app hides Cart. */}
      <ul className="grid h-[var(--bottom-bar)] auto-cols-fr grid-flow-col">
        {tabs.map(({ label, href, icon: Icon, active, badge }) => (
          <li key={label} className="min-w-0" data-web-checkout={label === "Cart" ? true : undefined}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={badge ? `${label}, ${badge} ${badge === 1 ? "resource" : "resources"}` : undefined}
              className="relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground aria-[current=page]:text-primary"
            >
              <span className="relative">
                <Icon className="size-6" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                {badge ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white" aria-hidden>
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
