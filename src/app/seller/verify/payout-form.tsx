"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label, NativeSelect } from "@/components/ui/form";
import { type PayoutState, savePayout } from "./actions";

export function PayoutForm({ hasExisting, methods }: { hasExisting: boolean; methods: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(savePayout, {} as PayoutState);
  const [method, setMethod] = useState("gcash");
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok ? <FormAlert tone="success">Payout details saved.</FormAlert> : null}
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="method">Pay me through</Label>
        <NativeSelect id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {methods.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </NativeSelect>
        <FieldError id="method-error" messages={fe.method} />
      </div>
      {method === "bank" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank_name">Bank</Label>
          <Input id="bank_name" name="bank_name" maxLength={120} placeholder="e.g. BDO, BPI, Landbank" aria-invalid={Boolean(fe.bank_name)} aria-describedby="bank_name-error" />
          <FieldError id="bank_name-error" messages={fe.bank_name} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account_name">Name on the account</Label>
        <Input id="account_name" name="account_name" maxLength={160} aria-invalid={Boolean(fe.account_name)} aria-describedby="account_name-error" />
        <FieldError id="account_name-error" messages={fe.account_name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account_number">{method === "bank" ? "Account number" : "Mobile number"}</Label>
        <Input
          id="account_number"
          name="account_number"
          inputMode="numeric"
          autoComplete="off"
          placeholder={method === "bank" ? "" : "0917 123 4567"}
          aria-invalid={Boolean(fe.account_number)}
          aria-describedby="account_number-error"
        />
        <FieldError id="account_number-error" messages={fe.account_number} />
      </div>
      <p className="text-xs text-muted-foreground">The name should match your verified ID. Changes are logged for your protection.</p>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : hasExisting ? "Replace payout details" : "Save payout details"}</Button>
      </div>
    </form>
  );
}
