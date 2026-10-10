"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, Label, NativeSelect } from "@/components/ui/form";
import { type PreferencesState, updateTeachingPreferences } from "./actions";

type Option = { code: string; name: string };

export function PreferencesForm({ grades, subjects, grade, subject }: { grades: Option[]; subjects: Option[]; grade: string; subject: string }) {
  const [state, action, pending] = useActionState(updateTeachingPreferences, {} as PreferencesState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok ? <FormAlert tone="success">Saved. Browse now starts with resources for what you teach.</FormAlert> : null}
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-grade">Grade you teach</Label>
          <NativeSelect id="pref-grade" name="grade" defaultValue={grade}>
            <option value="">Any grade</option>
            {grades.map((g) => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-subject">Subject you teach</Label>
          <NativeSelect id="pref-subject" name="subject" defaultValue={subject}>
            <option value="">Any subject</option>
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save what I teach"}</Button>
      </div>
    </form>
  );
}
