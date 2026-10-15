"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleSaved } from "@/app/resources/actions";

/** Saves a resource to the Saved list in the viewer's library, or removes it. */
export function SaveButton({ productId, path, initiallySaved, compact = false, resourceTitle }: { productId: string; path: string; initiallySaved: boolean; compact?: boolean; resourceTitle?: string }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const result = await toggleSaved(productId, !saved, path);
      if (result.error) setError(result.error);
      else {
        setError(null);
        setSaved(Boolean(result.saved));
      }
    });
  return (
    <div className="relative flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" className={compact ? "size-9 rounded-full bg-surface/95 p-0 shadow-sm" : "h-11"} onClick={toggle} disabled={pending} aria-pressed={saved} aria-label={compact ? `${saved ? "Remove from saved" : "Save"}: ${resourceTitle ?? "resource"}` : undefined}>
        {saved ? <BookmarkCheck aria-hidden className="text-primary" /> : <Bookmark aria-hidden />} <span className={compact ? "sr-only" : undefined}>{saved ? "Saved" : "Save"}</span>
      </Button>
      {error ? <p role="alert" className={compact ? "absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-surface p-2 text-xs text-danger shadow-lg" : "text-xs text-danger"}>{error}</p> : null}
    </div>
  );
}
