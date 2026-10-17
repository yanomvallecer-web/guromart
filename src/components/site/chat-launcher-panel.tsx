"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircleQuestion, X } from "lucide-react";
import { HelperChat } from "@/app/help/helper-chat";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Pages with their own chat box or a full-screen form keep the corner clear.
const HIDDEN = [/^\/help$/, /^\/messages\/.+/, /^\/sign-in/, /^\/auth\//];

/**
 * The floating help button and its panel. Signed-in teachers get the AI helper
 * when it's switched on; everyone else gets quick answers (children).
 */
export function ChatLauncherPanel({ signedIn, enabled, children }: { signedIn: boolean; enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  // Remembers the page it was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN.some((p) => p.test(pathname))) return null;
  const showHelper = enabled && signedIn;

  return (
    <>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Ask GuroMart"
          tabIndex={-1}
          data-testid="chat-panel"
          // Following a link or searching from the panel closes it.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          onSubmit={(e) => {
            if ((e.target as HTMLElement).getAttribute("action") === "/browse") setOpen(false);
          }}
          className={cn(
            "fixed inset-x-2 top-16 z-40 flex flex-col overflow-hidden rounded-[16px] border border-border bg-background shadow-2xl outline-none",
            "bottom-[calc(var(--bottom-bar)+env(safe-area-inset-bottom)+5rem)] md:inset-x-auto md:top-auto md:right-6 md:bottom-24 md:h-[min(600px,calc(100dvh-8rem))] md:w-[400px]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
            <p className="font-display text-lg font-bold">Ask GuroMart</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted"
              aria-label="Close"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {showHelper ? (
              <HelperChat initialLeft={null} />
            ) : (
              <div className="flex flex-col gap-4">
                {enabled ? (
                  <div className="flex flex-col items-start gap-2 rounded-[12px] border border-border bg-surface p-4">
                    <p className="text-sm">Sign in to ask the GuroMart helper your own question.</p>
                    <Link href={`/sign-in?next=${encodeURIComponent("/help")}`} className={buttonVariants({ size: "sm" })}>
                      Sign in
                    </Link>
                  </div>
                ) : null}
                {children}
              </div>
            )}
            {signedIn ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Questions for a seller? Use &ldquo;Message the seller&rdquo; on their resource, or open{" "}
                <Link href="/messages" className="font-semibold text-primary hover:underline">Messages</Link>.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close Ask GuroMart" : "Ask GuroMart"}
        data-testid="chat-launcher"
        className={cn(
          "fixed right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg hover:bg-primary-hover",
          "bottom-[calc(var(--bottom-bar)+env(safe-area-inset-bottom)+1rem)] md:right-6 md:bottom-6",
          // The teacher home's top bar has its own Ask GuroMart on wide screens (app/home/page.tsx).
        )}
      >
        {open ? <X aria-hidden className="size-6" /> : <MessageCircleQuestion aria-hidden className="size-6" />}
        <span className="hidden text-sm font-semibold sm:inline">{open ? "Close" : "Ask GuroMart"}</span>
      </button>
    </>
  );
}
