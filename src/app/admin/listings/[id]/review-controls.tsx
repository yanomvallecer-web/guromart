"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { FormAlert, Label, Textarea } from "@/components/ui/form";
import { type ReviewState, markFile } from "../actions";

const SCAN: Record<string, { label: string; tone: string }> = {
  pending: { label: "Not checked", tone: "bg-accent-soft text-foreground" },
  clean: { label: "Checked, safe", tone: "bg-success-soft text-success" },
  infected: { label: "Blocked", tone: "bg-danger-soft text-danger" },
  failed: { label: "Check failed", tone: "bg-danger-soft text-danger" },
};

export function FileCheck({ productId, fileId, name, status }: { productId: string; fileId: string; name: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scan = SCAN[status] ?? SCAN.pending;
  const mark = (result: "clean" | "infected") =>
    start(async () => {
      const r = await markFile(productId, fileId, result);
      setError(r.error ?? null);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className={scan.tone}>{scan.label}</Badge>
      {status !== "clean" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => mark("clean")} aria-label={`Mark ${name} safe`}>
          Mark safe
        </Button>
      ) : null}
      {status !== "infected" ? (
        <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => mark("infected")} aria-label={`Block ${name}`}>
          Block
        </Button>
      ) : null}
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}

export function DecisionForm({ action, unchecked }: { action: (prev: ReviewState, form: FormData) => Promise<ReviewState>; unchecked: number }) {
  const [state, formAction, pending] = useActionState(action, {} as ReviewState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-bold">Decision</h2>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Note to the seller</Label>
        <Textarea id="reason" name="reason" rows={4} maxLength={1000} placeholder="Required when rejecting: say exactly what to fix." />
      </div>
      {unchecked > 0 ? (
        <p className="text-sm text-muted-foreground">
          {unchecked} file{unchecked > 1 ? "s" : ""} still to mark safe before approving.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending || unchecked > 0}>
          Approve and publish
        </Button>
        <Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>
          Reject with note
        </Button>
      </div>
    </form>
  );
}
