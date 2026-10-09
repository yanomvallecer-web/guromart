"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label } from "@/components/ui/form";
import { type ProfileState, updateProfile } from "./actions";

type Profile = { display_name: string; school_name: string | null; region: string | null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, {} as ProfileState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok ? <FormAlert tone="success">Profile saved.</FormAlert> : null}
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Name shown on GuroMart</Label>
        <Input id="display_name" name="display_name" required maxLength={80} defaultValue={profile.display_name} aria-invalid={Boolean(fe.display_name)} aria-describedby="display_name-error" />
        <FieldError id="display_name-error" messages={fe.display_name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="school_name">School (optional)</Label>
        <Input id="school_name" name="school_name" maxLength={160} defaultValue={profile.school_name ?? ""} aria-describedby="school_name-error" />
        <FieldError id="school_name-error" messages={fe.school_name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="region">Region (optional)</Label>
        <Input id="region" name="region" maxLength={80} placeholder="e.g. Region IV-A (CALABARZON)" defaultValue={profile.region ?? ""} aria-describedby="region-error" />
        <FieldError id="region-error" messages={fe.region} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}
