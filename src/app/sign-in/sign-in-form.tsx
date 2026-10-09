"use client";

import { useActionState, useEffect, useState } from "react";
import { ExternalLink, Mail } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormAlert, Input, Label } from "@/components/ui/form";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { type SignInState, sendCode, verifyCode } from "./actions";
import { CODE_LENGTH, CodeInput } from "./code-input";

/** Supabase lets each address request a new email about once a minute. */
const RESEND_AFTER_SECONDS = 60;

export function SignInForm({ next }: { next: string }) {
  const hydrated = useHydrated();
  const [emailState, sendAction, sending] = useActionState(sendCode, { step: "email" } as SignInState);
  const [codeState, verifyAction, verifying] = useActionState(verifyCode, { step: "code", email: "" } as SignInState);
  // "Use a different email" hides this answer and shows the email form again.
  const [dismissed, setDismissed] = useState<SignInState | null>(null);
  const [wait, setWait] = useState(RESEND_AFTER_SECONDS);
  const onCodeStep = emailState.step === "code" && dismissed !== emailState;

  // Count down to when a new code may be requested, from each email sent.
  useEffect(() => {
    if (!onCodeStep) return;
    const until = Date.now() + RESEND_AFTER_SECONDS * 1000;
    const tick = () => setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [emailState, onCodeStep]);

  const signInHref = `/sign-in?next=${encodeURIComponent(next)}`;

  if (onCodeStep && emailState.step === "code") {
    const error = codeState.email === emailState.email ? codeState.error : undefined;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden>
            <Mail className="size-5" />
          </span>
          <h2 className="font-display text-2xl font-bold">Check your email</h2>
          <p className="text-[15px] text-muted-foreground">
            We sent a {CODE_LENGTH}-digit code and a sign-in link to <span className="font-semibold text-foreground">{emailState.email}</span>. Type the code
            below, or open the link on this phone.
          </p>
        </div>

        <form action={verifyAction} className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <input type="hidden" name="email" value={emailState.email} />
          <input type="hidden" name="next" value={next} />
          <CodeInput invalid={Boolean(error)} resetKey={codeState} />
          <Button type="submit" size="lg" disabled={verifying}>
            {verifying ? "Checking…" : "Sign in"}
          </Button>
        </form>

        <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
          <Mail aria-hidden /> Open Gmail <ExternalLink className="text-muted-foreground" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>

        <section aria-labelledby="no-email-h" className="flex flex-col gap-2 rounded-[12px] bg-surface-muted p-4 text-sm">
          <h3 id="no-email-h" className="font-semibold">Didn&apos;t get it?</h3>
          <p className="text-muted-foreground">It can take a minute. Check your Spam or Promotions folder, too.</p>
          {emailState.resent ? <p role="status" className="text-success">We sent a new code. Use the newest email.</p> : null}
          {emailState.resendError ? <p role="alert" className="text-danger">{emailState.resendError}</p> : null}
          <form action={sendAction}>
            <input type="hidden" name="email" value={emailState.email} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="resend" value="1" />
            <Button type="submit" variant="link" className="h-11 px-0" disabled={sending || (hydrated && wait > 0)}>
              {sending
                ? "Sending…"
                : hydrated && wait > 0
                  ? `Send a new code in 0:${String(wait).padStart(2, "0")}`
                  : "Send a new code"}
            </Button>
          </form>
          <a
            href={signInHref}
            onClick={(e) => {
              e.preventDefault();
              setDismissed(emailState);
            }}
            className="flex min-h-11 items-center font-semibold text-primary hover:underline"
          >
            Use a different email
          </a>
        </section>
      </div>
    );
  }

  return (
    <form action={sendAction} className="flex flex-col gap-4">
      {emailState.error ? <FormAlert>{emailState.error}</FormAlert> : null}
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={emailState.email}
          aria-invalid={Boolean(emailState.error)}
          aria-describedby="email-hint"
        />
        <p id="email-hint" className="text-sm text-muted-foreground">
          We&apos;ll email you a {CODE_LENGTH}-digit code and a sign-in link. No password needed.
        </p>
      </div>
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in code"}
      </Button>
    </form>
  );
}
