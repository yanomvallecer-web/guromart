"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label, NativeSelect, Textarea } from "@/components/ui/form";
import { LICENSE_TYPES } from "@/lib/listings/schema";
import type { ActionState } from "../actions";

type Option = { code: string; name: string };

export type ListingValues = {
  title: string;
  summary: string;
  description: string;
  category: string;
  subject: string;
  curriculum: string;
  period: string;
  period_detail: string;
  topic: string;
  learning_competency: string;
  language: string;
  grades: string[];
  price: string;
  page_count: string;
  is_editable: boolean;
  license_type: string;
  license_terms: string;
  copyright_declared: boolean;
};

export function ListingForm({
  action,
  values,
  options,
  readOnly,
  liveWarning,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values: ListingValues;
  options: { categories: Option[]; subjects: Option[]; grades: Option[]; curricula: Option[]; periods: Option[]; languages: Option[] };
  readOnly: boolean;
  liveWarning: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const fe = state.fieldErrors ?? {};
  const field = (name: keyof ListingValues) => ({
    id: name,
    name,
    "aria-invalid": Boolean(fe[name]),
    "aria-describedby": `${name}-error`,
  });

  const select = (name: keyof ListingValues, label: string, items: Option[], placeholder: string, required = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <NativeSelect {...field(name)} defaultValue={values[name] as string} required={required}>
        <option value="">{placeholder}</option>
        {items.map((i) => (
          <option key={i.code} value={i.code}>{i.name}</option>
        ))}
      </NativeSelect>
      <FieldError id={`${name}-error`} messages={fe[name]} />
    </div>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset disabled={readOnly || pending} className="flex flex-col gap-6">
        {liveWarning ? (
          <p className="rounded-[10px] bg-accent-soft px-4 py-3 text-sm">This resource is live. Saving changes sends it back to review, and it stays hidden until approved.</p>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold">About the resource</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input {...field("title")} required minLength={4} maxLength={160} defaultValue={values.title} />
            <FieldError id="title-error" messages={fe.title} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="summary">Short summary (optional)</Label>
            <Input {...field("summary")} maxLength={300} defaultValue={values.summary} placeholder="One line shown under the title" />
            <FieldError id="summary-error" messages={fe.summary} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea {...field("description")} maxLength={10000} rows={8} defaultValue={values.description} placeholder="What's inside, how teachers use it, and what's included (answer keys, editable files, number of pages)." />
            <FieldError id="description-error" messages={fe.description} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold">Where it fits</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {select("category", "Resource type", options.categories, "Choose a type", true)}
            {select("subject", "Subject", options.subjects, "Choose a subject")}
            {select("curriculum", "Curriculum (optional)", options.curricula, "Any curriculum")}
            {select("language", "Language (optional)", options.languages, "Not specified")}
            {select("period", "Quarter or period (optional)", options.periods, "Not specified")}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period_detail">Week or lesson (optional)</Label>
              <Input {...field("period_detail")} maxLength={80} defaultValue={values.period_detail} placeholder="e.g. Week 3" />
              <FieldError id="period_detail-error" messages={fe.period_detail} />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Grade levels</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {options.grades.map((g) => (
                <label key={g.code} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="grades" value={g.code} defaultChecked={values.grades.includes(g.code)} className="size-4 accent-primary" />
                  {g.name}
                </label>
              ))}
            </div>
            <FieldError id="grades-error" messages={fe.grades} />
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">Topic (optional)</Label>
            <Input {...field("topic")} maxLength={200} defaultValue={values.topic} />
            <FieldError id="topic-error" messages={fe.topic} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="learning_competency">Learning competency (optional)</Label>
            <Textarea {...field("learning_competency")} maxLength={1000} rows={3} defaultValue={values.learning_competency} placeholder="The MELC or competency code and text this covers" />
            <FieldError id="learning_competency-error" messages={fe.learning_competency} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold">Price and license</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Price in pesos</Label>
              <Input {...field("price")} inputMode="decimal" defaultValue={values.price} placeholder="0 for free" />
              <p className="text-xs text-muted-foreground">Use 0 for free, or at least ₱30.</p>
              <FieldError id="price-error" messages={fe.price} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page_count">Pages or slides (optional)</Label>
              <Input {...field("page_count")} inputMode="numeric" defaultValue={values.page_count} />
              <FieldError id="page_count-error" messages={fe.page_count} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_editable" defaultChecked={values.is_editable} className="size-4 accent-primary" />
            Buyers can edit the files (for example, Word or PowerPoint)
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Who may use one purchase</legend>
            {LICENSE_TYPES.map((l) => (
              <label key={l.value} className="flex items-start gap-2 text-sm">
                <input type="radio" name="license_type" value={l.value} defaultChecked={values.license_type === l.value} className="mt-0.5 size-4 accent-primary" />
                <span>
                  <span className="font-semibold">{l.label}.</span> <span className="text-muted-foreground">{l.hint}</span>
                </span>
              </label>
            ))}
            <FieldError id="license_type-error" messages={fe.license_type} />
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="license_terms">Extra license terms (optional)</Label>
            <Textarea {...field("license_terms")} maxLength={4000} rows={3} defaultValue={values.license_terms} />
            <FieldError id="license_terms-error" messages={fe.license_terms} />
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface-muted p-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="copyright_declared" defaultChecked={values.copyright_declared} className="mt-0.5 size-4 accent-primary" />
            <span>
              I made this resource or have written permission to sell it. It does not copy DepEd modules, textbooks or other people&apos;s work
              beyond what the law allows, and I understand GuroMart removes listings that infringe copyright.
            </span>
          </label>
          <FieldError id="copyright_declared-error" messages={fe.copyright_declared} />
        </section>

        {state.error ? <FormAlert>{state.error}</FormAlert> : null}
        {state.ok ? <FormAlert tone="success">Changes saved.</FormAlert> : null}
        <div>
          <Button type="submit">{pending ? "Saving…" : "Save changes"}</Button>
        </div>
      </fieldset>
    </form>
  );
}
