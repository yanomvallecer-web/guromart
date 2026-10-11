"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert, Label, Textarea } from "@/components/ui/form";
import { linkify, QUESTION_MAX, type HelperTurn } from "@/lib/assistant/core";
import { cn } from "@/lib/utils";
import { askHelper } from "./actions";

const STARTERS = ["How do refunds work?", "How much does GuroMart keep when I sell?", "Find a Grade 4 fractions worksheet"];

function Answer({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.href ? (
          <Link key={i} href={part.href} className="font-semibold text-primary underline-offset-2 hover:underline">{part.text}</Link>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** The chat with the GuroMart helper. The conversation lives only in this page; reloading starts over. */
export function HelperChat({ initialLeft }: { initialLeft: number | null }) {
  const [turns, setTurns] = useState<HelperTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(initialLeft);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns.length, pending]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    const next: HelperTurn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
    setError(null);
    start(async () => {
      const result = await askHelper(next);
      if (typeof result.left === "number") setLeft(result.left);
      if (result.text) setTurns([...next, { role: "assistant", text: result.text }]);
      else {
        // Put the question back so it can be sent again.
        setTurns(turns);
        setDraft(text);
        setError(result.error ?? "Please try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3" aria-label="Chat with the GuroMart helper" aria-live="polite" data-testid="helper-chat">
        <li className="flex items-start gap-2">
          <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Bot aria-hidden className="size-4" /></span>
          <p className="max-w-[85%] rounded-[14px] border border-border bg-surface px-3.5 py-2 text-[15px]">
            Hi! I&apos;m the GuroMart helper. Ask me about buying, refunds, selling, fees and payouts, or tell me what resource you need.
          </p>
        </li>
        {turns.map((t, i) => (
          <li key={i} className={cn("flex items-start gap-2", t.role === "user" && "justify-end")} data-role={t.role}>
            {t.role === "assistant" ? (
              <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Bot aria-hidden className="size-4" /></span>
            ) : null}
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-line break-words rounded-[14px] px-3.5 py-2 text-[15px]",
                t.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-surface",
              )}
            >
              <span className="sr-only">{t.role === "user" ? "You: " : "GuroMart helper: "}</span>
              {t.role === "assistant" ? <Answer text={t.text} /> : t.text}
            </p>
          </li>
        ))}
        {pending ? <li className="pl-10 text-sm text-muted-foreground">The helper is writing…</li> : null}
      </ol>
      <div ref={endRef} />

      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <Button key={s} type="button" variant="outline" size="sm" className="h-auto min-h-11 whitespace-normal text-left" onClick={() => ask(s)} disabled={pending || left === 0}>
              {s}
            </Button>
          ))}
        </div>
      ) : null}

      <Card className="flex flex-col gap-2 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex flex-col gap-2"
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Label htmlFor="helper-question" className="sr-only">Your question</Label>
          <div className="flex items-end gap-2">
            <Textarea
              id="helper-question"
              rows={2}
              maxLength={QUESTION_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              placeholder={left === 0 ? "You've used today's questions" : "Ask a question"}
              disabled={left === 0}
              className="min-h-12 flex-1"
            />
            <Button type="submit" className="h-12" disabled={pending || !draft.trim() || left === 0} aria-label="Ask">
              <Send aria-hidden /> <span className="hidden sm:inline">Ask</span>
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground" data-testid="helper-left">
          {left === null ? "" : left === 0 ? "You've used today's questions. You can ask again tomorrow. " : `${left} question${left === 1 ? "" : "s"} left today. `}
          The helper is an AI and can make mistakes. It can&apos;t see your orders or payments. For those, use <Link href="/contact" className="font-semibold text-primary hover:underline">Contact</Link>.
        </p>
      </Card>
    </div>
  );
}
