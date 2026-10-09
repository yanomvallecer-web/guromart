"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label } from "@/components/ui/form";
import { slugify } from "@/lib/format";
import { SELLER_TYPES } from "@/lib/validation/seller";
import { type StartSellingState, startSelling } from "./actions";

export function StartSellingForm() {
  const [state, action, pending] = useActionState(startSelling, {} as StartSellingState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">What kind of seller are you?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {SELLER_TYPES.map((t) => (
            <label key={t.value} className="flex cursor-pointer gap-3 rounded-[12px] border border-input bg-surface p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="radio" name="seller_type" value={t.value} required className="mt-1 accent-[var(--primary)]" />
              <span>
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-sm text-muted-foreground">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="seller_type-error" messages={fe.seller_type} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="store_name">Shop name</Label>
        <Input
          id="store_name"
          name="store_name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          aria-invalid={Boolean(fe.store_name)}
          aria-describedby="store_name-error"
        />
        <FieldError id="store_name-error" messages={fe.store_name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="store_slug">Shop address</Label>
        <div className="flex items-center overflow-hidden rounded-[10px] border border-input bg-surface focus-within:border-primary">
          <span className="pl-3 text-sm text-muted-foreground">guromart.ph/shop/</span>
          <input
            id="store_slug"
            name="store_slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="h-11 min-w-0 flex-1 bg-transparent pr-3 text-[15px] outline-none"
            aria-invalid={Boolean(fe.store_slug)}
            aria-describedby="store_slug-error"
          />
        </div>
        <FieldError id="store_slug-error" messages={fe.store_slug} />
      </div>

      <label className="flex gap-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          I will only sell materials I created or have the right to sell, and I will not upload DepEd self-learning modules or other copyrighted
          works I don&apos;t own. I accept the GuroMart seller terms (being finalized before launch).
        </span>
      </label>
      <FieldError id="agree-error" messages={fe.agree} />

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Opening your shop…" : "Open my shop"}
        </Button>
      </div>
    </form>
  );
}
