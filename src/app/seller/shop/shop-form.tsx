"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label, Textarea } from "@/components/ui/form";
import { type ShopState, saveShop } from "./actions";

type Values = { name: string; tagline: string; description: string; is_published: boolean };

export function ShopForm({ values, canPublish }: { values: Values; canPublish: boolean }) {
  const [state, action, pending] = useActionState(saveShop, {} as ShopState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok ? <FormAlert tone="success">Shop saved.</FormAlert> : null}
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Shop name</Label>
        <Input id="name" name="name" required maxLength={80} defaultValue={values.name} aria-invalid={Boolean(fe.name)} aria-describedby="name-error" />
        <FieldError id="name-error" messages={fe.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tagline">Tagline (optional)</Label>
        <Input id="tagline" name="tagline" maxLength={140} defaultValue={values.tagline} placeholder="e.g. Ready-to-print Grade 4 Science worksheets" aria-describedby="tagline-error" />
        <FieldError id="tagline-error" messages={fe.tagline} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">About your shop (optional)</Label>
        <Textarea id="description" name="description" rows={6} maxLength={4000} defaultValue={values.description} placeholder="Who you are, what you teach, and what teachers can expect from your materials." aria-describedby="description-error" />
        <FieldError id="description-error" messages={fe.description} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="is_published" defaultChecked={values.is_published} className="mt-0.5 size-4 accent-primary" />
        <span>
          Show my shop to teachers
          {canPublish ? null : <span className="block text-muted-foreground">Takes effect once your first resource is approved.</span>}
        </span>
      </label>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save shop"}</Button>
      </div>
    </form>
  );
}
