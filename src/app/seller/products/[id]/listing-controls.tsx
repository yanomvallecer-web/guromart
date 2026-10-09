"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { type ActionState, setListingStatus, submitListing } from "../actions";

export function ListingControls({ listingId, status, ready }: { listingId: string; status: string; ready: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>({});
  const run = (fn: () => Promise<ActionState>) => start(async () => setResult(await fn()));

  return (
    <div className="flex flex-col gap-3">
      {result.error ? <FormAlert>{result.error}</FormAlert> : null}
      {result.problems?.length ? (
        <FormAlert>
          <ul className="list-disc pl-4">
            {result.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </FormAlert>
      ) : null}
      {status === "draft" || status === "rejected" ? (
        <Button disabled={pending || !ready} onClick={() => run(() => submitListing(listingId))}>
          {pending ? "Working…" : "Submit for review"}
        </Button>
      ) : null}
      {status === "pending_review" || status === "published" ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setListingStatus(listingId, "draft"))}>
          {status === "published" ? "Unpublish to draft" : "Withdraw to draft"}
        </Button>
      ) : null}
      {status !== "suspended" ? (
        <Button
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={() => {
            if (confirm("Archive this resource? It will be hidden from your shop. Buyers keep their downloads.")) {
              run(() => setListingStatus(listingId, "archived"));
            }
          }}
        >
          Archive
        </Button>
      ) : null}
    </div>
  );
}
