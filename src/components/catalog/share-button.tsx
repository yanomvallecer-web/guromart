"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * Shares a page with the phone's share sheet (Messenger, Viber, email…), or
 * copies the link where the Web Share API isn't available. Rendered only once
 * JavaScript runs, so there is never a button that does nothing.
 */
export function ShareButton({ title }: { title: string }) {
  const hydrated = useHydrated();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  if (!hydrated) return null;

  const share = async () => {
    const url = window.location.href.split("#")[0];
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // Closing the share sheet is not an error worth reporting.
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={share} className="h-11">
        {status === "copied" ? <Check aria-hidden /> : <Share2 aria-hidden />} {status === "copied" ? "Link copied" : "Share"}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {status === "failed" ? (
          <>
            Copy this link: <span className="select-all break-all font-medium text-foreground">{window.location.href.split("#")[0]}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
