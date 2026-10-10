"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Presentation } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/card";
import type { DeckListing } from "@/lib/admin/slide-previews";
import { MAX_PREVIEWS } from "@/lib/listings/uploads";
import { createClient } from "@/lib/supabase/browser";
import { confirmSlide, deckLink, slideTicket } from "./actions";

type RowState = { state: "waiting" | "working" | "done" | "failed"; note?: string };

/** Fills each listing's free preview places with its PowerPoint's slides, one listing at a time. */
export function SlideBackfill({ items: fresh }: { items: DeckListing[] }) {
  // The list is kept as it was when the page opened: each added slide refreshes the
  // server data, and rows shouldn't vanish mid-run.
  const [items] = useState(fresh);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const set = (id: string, s: RowState) => setRows((r) => ({ ...r, [id]: s }));

  async function one(item: DeckListing) {
    const slots = MAX_PREVIEWS - item.previews;
    set(item.productId, { state: "working", note: "Opening the PowerPoint…" });
    const link = await deckLink(item.productId, item.deck.id);
    if (!link.ok) return set(item.productId, { state: "failed", note: link.error });
    try {
      const res = await fetch(link.url);
      if (!res.ok) throw new Error(String(res.status));
      const { renderSlideImages } = await import("@/lib/listings/slide-images");
      // An existing cover is usually slide 1, so start at slide 2 then.
      const { images } = await renderSlideImages(
        await res.blob(),
        slots,
        (done, total) => set(item.productId, { state: "working", note: `Drawing slide ${Math.min(done + 1, total)} of ${total}…` }),
        item.previews > 0 ? 1 : 0,
      );
      const supabase = createClient();
      let added = 0;
      for (const img of images) {
        URL.revokeObjectURL(img.url);
        const name = `slide-${img.index + 1}.jpg`;
        set(item.productId, { state: "working", note: `Adding slide ${img.index + 1}…` });
        const ticket = await slideTicket(item.productId, name, img.blob.size);
        if (!ticket.ok) throw new Error(ticket.error);
        const sent = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, img.blob, { contentType: "image/jpeg" });
        if (sent.error) throw new Error("The upload didn't finish.");
        const ok = await confirmSlide(item.productId, ticket.path, name);
        if (!ok.ok) throw new Error(ok.error);
        added++;
      }
      set(item.productId, { state: "done", note: `Added ${added} ${added === 1 ? "slide" : "slides"}.` });
    } catch (e) {
      set(item.productId, { state: "failed", note: e instanceof Error && e.message.length < 120 ? e.message : "Couldn't draw this PowerPoint." });
    }
  }

  async function all() {
    setRunning(true);
    for (const item of items) if (rows[item.productId]?.state !== "done") await one(item);
    setRunning(false);
  }

  if (!items.length) {
    return (
      <EmptyState icon={<Presentation aria-hidden />} title="Every PowerPoint listing has its slide previews">
        New PowerPoints get theirs when the seller uploads them.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={running} onClick={() => void all()}>
          {running ? "Making slide previews…" : `Make slide previews for ${items.length} ${items.length === 1 ? "listing" : "listings"}`}
        </Button>
        <p className="text-sm text-muted-foreground">Keep this page open until every row says what happened. Reload afterwards to see what&apos;s left.</p>
      </div>
      <Card className="divide-y divide-border" data-testid="slide-backfill">
        {items.map((item) => {
          const row = rows[item.productId];
          return (
            <div key={item.productId} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <Link href={`/resources/${item.slug}`} className="font-semibold text-primary hover:underline">
                  {item.title}
                </Link>
                <p className="truncate text-sm text-muted-foreground">
                  {item.deck.name} · {item.previews} of {MAX_PREVIEWS} previews · {item.status.replace("_", " ")}
                </p>
              </div>
              <span
                role="status"
                className={`text-sm ${row?.state === "failed" ? "text-danger" : row?.state === "done" ? "font-semibold text-success" : "text-muted-foreground"}`}
              >
                {row?.note ?? "Waiting"}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
