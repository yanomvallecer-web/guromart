"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/** Copies text to the clipboard. Appears only once JavaScript runs, so it always works when shown. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const hydrated = useHydrated();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  if (!hydrated) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus("copied");
          } catch {
            setStatus("failed");
          }
        }}
      >
        {status === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />} {status === "copied" ? "Copied" : label}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {status === "failed" ? "Couldn't copy. Press and hold the link to copy it." : ""}
      </span>
    </>
  );
}
