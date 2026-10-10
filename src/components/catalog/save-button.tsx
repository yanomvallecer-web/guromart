"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleSaved } from "@/app/resources/actions";

/** Saves a resource to the Saved list in the viewer's library, or removes it. */
export function SaveButton({ productId, path, initiallySaved }: { productId: string; path: string; initiallySaved: boolean }) {
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
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" className="h-11" onClick={toggle} disabled={pending} aria-pressed={saved}>
        {saved ? <BookmarkCheck aria-hidden className="text-primary" /> : <Bookmark aria-hidden />} {saved ? "Saved" : "Save"}
      </Button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
