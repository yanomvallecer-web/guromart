"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label, NativeSelect } from "@/components/ui/form";
import { type ActionState, createListing } from "../actions";

export function NewListingForm({ categories }: { categories: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createListing, {} as ActionState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required minLength={4} maxLength={160} placeholder="e.g. Grade 4 Science Quarter 1 Worksheets" aria-invalid={Boolean(fe.title)} aria-describedby="title-error" />
        <FieldError id="title-error" messages={fe.title} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Resource type</Label>
        <NativeSelect id="category" name="category" required defaultValue="" aria-invalid={Boolean(fe.category)} aria-describedby="category-error">
          <option value="" disabled>Choose a type</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </NativeSelect>
        <FieldError id="category-error" messages={fe.category} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create draft"}</Button>
      </div>
    </form>
  );
}
