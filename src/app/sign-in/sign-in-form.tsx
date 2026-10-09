"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, Input, Label } from "@/components/ui/form";
import { type SignInState, sendCode, verifyCode } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [emailState, sendAction, sending] = useActionState(sendCode, { step: "email" } as SignInState);
  const [codeState, verifyAction, verifying] = useActionState(verifyCode, { step: "code", email: "" } as SignInState);

  if (emailState.step === "code") {
    const error = codeState.email ? codeState.error : undefined;
    return (
      <form action={verifyAction} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          We sent a sign-in code to <span className="font-semibold text-foreground">{emailState.email}</span>. It may take a minute to arrive.
        </p>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <input type="hidden" name="email" value={emailState.email} />
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="token">Code from your email</Label>
          <Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required autoFocus aria-invalid={Boolean(error)} />
        </div>
        <Button type="submit" disabled={verifying}>
          {verifying ? "Checking…" : "Sign in"}
        </Button>
        <p className="text-sm text-muted-foreground">You can also open the link in the email on this device.</p>
      </form>
    );
  }

  return (
    <form action={sendAction} className="flex flex-col gap-4">
      {emailState.error ? <FormAlert>{emailState.error}</FormAlert> : null}
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={emailState.email} aria-invalid={Boolean(emailState.error)} />
      </div>
      <Button type="submit" disabled={sending}>
        {sending ? "Sending code…" : "Email me a sign-in code"}
      </Button>
    </form>
  );
}
