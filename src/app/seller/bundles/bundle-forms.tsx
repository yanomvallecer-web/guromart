"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label, Textarea } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { type BundleState, createBundle, deleteBundle, saveBundle, setBundleStatus } from "./actions";


export function NewBundleForm() {
  const [state, action, pending] = useActionState(createBundle, {} as BundleState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bundle-title">Bundle name</Label>
        <Input id="bundle-title" name="title" required minLength={4} maxLength={160} placeholder="e.g. Heat vs. Temperature: full lesson" aria-describedby="bundle-title-error" />
        <FieldError id="bundle-title-error" messages={state.fieldErrors?.title} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create bundle"}</Button>
      </div>
    </form>
  );
}

type Resource = { id: string; title: string; price_centavos: number };

export function BundleEditor({
  bundle,
  resources,
  selected,
}: {
  bundle: { id: string; title: string; topic: string | null; description: string | null; price_centavos: number; status: string };
  resources: Resource[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState<BundleState, FormData>(saveBundle.bind(null, bundle.id), {});
  const [chosen, setChosen] = useState(new Set(selected));
  const locked = bundle.status !== "draft";
  const separate = resources.filter((r) => chosen.has(r.id)).reduce((s, r) => s + r.price_centavos, 0);
  const fe = state.fieldErrors ?? {};
  // Submitted by hand so React doesn't reset the form afterwards, which would untick the chosen resources.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {state.ok ? <FormAlert tone="success">Bundle saved.</FormAlert> : null}
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      {locked ? <p className="rounded-[10px] bg-surface-muted px-4 py-3 text-sm">Unpublish the bundle to change it.</p> : null}
      <fieldset disabled={locked} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Bundle name</Label>
          <Input id="title" name="title" required minLength={4} maxLength={160} defaultValue={bundle.title} aria-describedby="title-error" />
          <FieldError id="title-error" messages={fe.title} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topic">Lesson topic</Label>
          <Input id="topic" name="topic" maxLength={200} placeholder="e.g. Heat vs. Temperature" defaultValue={bundle.topic ?? ""} aria-describedby="topic-error" />
          <FieldError id="topic-error" messages={fe.topic} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">What&apos;s included and how to use it</Label>
          <Textarea id="description" name="description" rows={4} maxLength={4000} defaultValue={bundle.description ?? ""} aria-describedby="description-error" />
          <FieldError id="description-error" messages={fe.description} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Resources in this bundle</legend>
          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">You need live, paid resources first. Free resources can&apos;t go in a bundle.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
              {resources.map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      name="items"
                      value={r.id}
                      checked={chosen.has(r.id)}
                      onChange={(e) =>
                        setChosen((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                      className="size-5 accent-primary"
                    />
                    <span className="min-w-0 flex-1 text-[15px]">{r.title}</span>
                    <span className="text-sm text-muted-foreground">{formatPrice(r.price_centavos)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <FieldError id="items-error" messages={fe.items} />
          <p className="text-sm text-muted-foreground" data-testid="bundle-separate">
            {chosen.size} chosen{separate ? `, ${formatPrice(separate)} if bought separately` : ""}
          </p>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Bundle price (₱)</Label>
          <Input id="price" name="price" inputMode="decimal" required defaultValue={(bundle.price_centavos / 100).toString()} className="max-w-40" aria-describedby="price-hint price-error" />
          <p id="price-hint" className="text-sm text-muted-foreground">Must be less than the resources cost separately. GuroMart keeps 10% of each sale.</p>
          <FieldError id="price-error" messages={fe.price} />
        </div>
        <div>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save bundle"}</Button>
        </div>
      </fieldset>
    </form>
  );
}

export function BundleControls({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<BundleState>) => start(async () => setError((await fn()).error ?? null));
  if (status === "hidden") return <p className="text-sm text-danger">GuroMart staff hid this bundle. Contact support.</p>;
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {status === "draft" ? (
        <>
          <Button disabled={pending} onClick={() => run(() => setBundleStatus(id, "published"))}>{pending ? "Working…" : "Publish bundle"}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => deleteBundle(id))}>Delete draft</Button>
        </>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setBundleStatus(id, "draft"))}>{pending ? "Working…" : "Unpublish to edit"}</Button>
      )}
    </div>
  );
}
