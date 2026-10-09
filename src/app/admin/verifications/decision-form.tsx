"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, Label, Textarea } from "@/components/ui/form";
import type { DecisionState } from "./actions";

export function VerificationDecision({ id, action }: { id: string; action: (prev: DecisionState, form: FormData) => Promise<DecisionState> }) {
  const [state, formAction, pending] = useActionState(action, {} as DecisionState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`notes-${id}`}>Note to the seller</Label>
        <Textarea id={`notes-${id}`} name="notes" rows={2} maxLength={2000} placeholder="Required when rejecting" className="min-h-16" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>Verify</Button>
        <Button type="submit" name="decision" value="reject" size="sm" variant="outline" disabled={pending}>Reject with note</Button>
      </div>
    </form>
  );
}
