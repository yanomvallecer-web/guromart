"use client";

import { type ReactNode, useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChoiceChip } from "@/components/ui/chip";
import { FieldError, FormAlert, Input, Label, NativeSelect, Textarea } from "@/components/ui/form";
import { shortGradeLabel } from "@/lib/catalog/labels";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { LICENSE_TYPES } from "@/lib/listings/schema";
import { cn } from "@/lib/utils";
import type { ActionState } from "../actions";

export const STEPS = [
  { id: "file", label: "File" },
  { id: "details", label: "Details" },
  { id: "price", label: "Price" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

/** Fields on the price step; every other field the server can flag is on the details step. */
const PRICE_FIELDS = new Set(["price", "page_count", "is_editable", "license_type", "license_terms", "copyright_declared"]);

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

/**
 * The listing in three short steps: file, details, price. The details and
 * price fields stay in one form (inactive steps are only hidden), so every
 * save sends every field and the server checks them all exactly as before;
 * "Save draft" works on any step. When the server flags a field, the form
 * opens the step it is on. Before JavaScript runs, all steps show at once.
 */
export function ListingForm({
  action,
  values,
  options,
  readOnly,
  liveWarning,
  fileStep,
  initialStep,
  saveLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values: ListingValues;
  options: { categories: Option[]; subjects: Option[]; grades: Option[]; curricula: Option[]; periods: Option[]; languages: Option[] };
  readOnly: boolean;
  liveWarning: boolean;
  /** The upload panels, shown as the first step (uploads save on their own). */
  fileStep: ReactNode;
  initialStep: StepId;
  saveLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const fe = state.fieldErrors ?? {};
  const hydrated = useHydrated();
  const [step, setStep] = useState<StepId>(initialStep);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    const flagged = Object.keys(state.fieldErrors ?? {});
    if (flagged.length) setStep(flagged.some((f) => !PRICE_FIELDS.has(f)) ? "details" : "price");
  }
  const index = STEPS.findIndex((s) => s.id === step);
  const show = (id: StepId) => !hydrated || step === id;
  const go = (id: StepId) => {
    setStep(id);
    document.getElementById("listing-steps")?.scrollIntoView({ block: "start" });
  };
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
    <div className="flex flex-col gap-6">
      {hydrated ? (
        <nav id="listing-steps" aria-label="Listing steps" className="scroll-mt-4">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            Step {index + 1} of {STEPS.length}: {STEPS[index].label}
          </p>
          <ol className="grid grid-cols-3 gap-2">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={s.id === step ? "step" : undefined}
                  className="flex w-full flex-col gap-1.5 rounded-[10px] text-left text-sm font-semibold text-muted-foreground aria-[current=step]:text-primary"
                >
                  <span className={cn("h-1.5 w-full rounded-full", i <= index ? "bg-primary" : "bg-border")} aria-hidden />
                  <span className="flex min-h-11 items-center gap-1.5">
                    {i < index ? <Check className="size-4" aria-hidden /> : <span aria-hidden>{i + 1}.</span>} {s.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {liveWarning ? (
        <p className="rounded-[10px] bg-accent-soft px-4 py-3 text-sm">This resource is live. Saving changes sends it back to review, and it stays hidden until approved.</p>
      ) : null}

      <div hidden={!show("file")} className="flex flex-col gap-6">
        {fileStep}
      </div>

    <form id="listing-form" action={formAction} className="flex flex-col gap-6">
      <fieldset disabled={readOnly || pending} className="flex flex-col gap-6">
        <section hidden={!show("details")} className="flex flex-col gap-4">
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

          <h2 className="mt-2 font-display text-xl font-bold">Where it fits</h2>
          {select("category", "Resource type", options.categories, "Choose a type", true)}
          <ChipGroup legend="Grade levels">
            {options.grades.map((g) => (
              <ChoiceChip key={g.code} type="checkbox" name="grades" value={g.code} defaultChecked={values.grades.includes(g.code)}>
                <span aria-hidden>{shortGradeLabel(g.name)}</span>
                <span className="sr-only">{g.name}</span>
              </ChoiceChip>
            ))}
          </ChipGroup>
          <FieldError id="grades-error" messages={fe.grades} />
          <ChipGroup legend="Subject">
            {options.subjects.map((o) => (
              <ChoiceChip key={o.code} name="subject" value={o.code} defaultChecked={values.subject === o.code}>
                {o.name}
              </ChoiceChip>
            ))}
          </ChipGroup>
          <FieldError id="subject-error" messages={fe.subject} />
          <div className="grid gap-4 sm:grid-cols-2">
            {select("curriculum", "Curriculum (optional)", options.curricula, "Any curriculum")}
            {select("language", "Language (optional)", options.languages, "Not specified")}
            {select("period", "Quarter or period (optional)", options.periods, "Not specified")}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period_detail">Week or lesson (optional)</Label>
              <Input {...field("period_detail")} maxLength={80} defaultValue={values.period_detail} placeholder="e.g. Week 3" />
              <FieldError id="period_detail-error" messages={fe.period_detail} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">Lesson topic (needed before review)</Label>
            <Input {...field("topic")} maxLength={200} defaultValue={values.topic} placeholder="e.g. Heat vs. Temperature" />
            <p className="text-xs text-muted-foreground">Shown as the main title on cards and your resource page. Keep it short: one topic, not a list.</p>
            <FieldError id="topic-error" messages={fe.topic} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="learning_competency">Learning competency (optional)</Label>
            <Textarea {...field("learning_competency")} maxLength={1000} rows={3} defaultValue={values.learning_competency} placeholder="The MELC or competency code and text this covers" />
            <FieldError id="learning_competency-error" messages={fe.learning_competency} />
          </div>
        </section>

        <section hidden={!show("price")} className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface-muted p-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="copyright_declared" defaultChecked={values.copyright_declared} className="mt-0.5 size-4 accent-primary" />
            <span>
              I made this resource or have written permission to sell it. It does not copy DepEd modules, textbooks or other people&apos;s work
              beyond what the law allows, and I understand GuroMart removes listings that infringe copyright.
            </span>
          </label>
          <FieldError id="copyright_declared-error" messages={fe.copyright_declared} />
          </div>
        </section>
      </fieldset>
    </form>

      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      {state.ok ? <FormAlert tone="success">Changes saved.</FormAlert> : null}
      <div className="flex flex-wrap items-center gap-3">
        {hydrated && index > 0 ? (
          <Button type="button" variant="outline" onClick={() => go(STEPS[index - 1].id)}>
            Back
          </Button>
        ) : null}
        {!readOnly ? (
          <Button type="submit" form="listing-form" variant={hydrated && index < STEPS.length - 1 ? "outline" : "primary"} disabled={pending}>
            {pending ? "Saving…" : saveLabel}
          </Button>
        ) : null}
        {hydrated && index < STEPS.length - 1 ? (
          <Button type="button" onClick={() => go(STEPS[index + 1].id)}>
            Next: {STEPS[index + 1].label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
