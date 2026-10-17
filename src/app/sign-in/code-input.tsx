"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui/form";
import { useHydrated } from "@/lib/hooks/use-hydrated";

export const CODE_LENGTH = 6;

/**
 * The sign-in code as six digit boxes. Typing moves to the next box, Backspace
 * goes back, and pasting or the phone's one-time-code autofill fills them all.
 * When the last digit is in, the form submits itself.
 *
 * Before JavaScript runs (or without it) this is one ordinary text field with
 * the same name, so the form still works.
 */
export function CodeInput({ invalid, resetKey }: { invalid: boolean; resetKey: unknown }) {
  const hydrated = useHydrated();
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const submitted = useRef<string | null>(null);
  const [lastReset, setLastReset] = useState(resetKey);

  // A new answer from the server (wrong code, new code sent): start again from the first box.
  if (lastReset !== resetKey) {
    setLastReset(resetKey);
    setDigits(Array(CODE_LENGTH).fill(""));
  }

  const code = digits.join("");
  useEffect(() => {
    if (code.length < CODE_LENGTH) submitted.current = null;
    else if (submitted.current !== code) {
      submitted.current = code;
      boxes.current[0]?.form?.requestSubmit();
    }
  }, [code]);

  useEffect(() => {
    if (hydrated && code === "") boxes.current[0]?.focus();
    // Only when the boxes first appear or are cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, resetKey]);

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="token">Code from your email</Label>
        <Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required aria-invalid={invalid} />
      </div>
    );
  }

  /** Writes digits starting at a box, as typing, autofill and paste all do. */
  const fill = (start: number, text: string) => {
    const incoming = text.replace(/\D/g, "").slice(0, CODE_LENGTH - start).split("");
    if (!incoming.length) return;
    const next = [...digits];
    incoming.forEach((d, i) => (next[start + i] = d));
    setDigits(next);
    boxes.current[Math.min(start + incoming.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p id="code-label" className="text-sm font-semibold text-foreground">Code from your email</p>
      <input type="hidden" name="token" value={code} />
      <div role="group" aria-labelledby="code-label" className="grid grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
            aria-invalid={invalid}
            className="h-14 w-full min-w-0 rounded-[10px] border border-input bg-surface text-center font-display text-2xl font-bold text-foreground focus-visible:border-primary aria-invalid:border-danger"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (value === "") {
                const next = [...digits];
                next[i] = "";
                setDigits(next);
                return;
              }
              // Autofill and some keyboards put the whole code in one box.
              fill(i, value.length > 1 && d && value.startsWith(d) ? value.slice(1) : value);
            }}
            onPaste={(e) => {
              e.preventDefault();
              fill(i, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !d && i > 0) {
                e.preventDefault();
                const next = [...digits];
                next[i - 1] = "";
                setDigits(next);
                boxes.current[i - 1]?.focus();
              } else if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                boxes.current[i - 1]?.focus();
              } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
                e.preventDefault();
                boxes.current[i + 1]?.focus();
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
