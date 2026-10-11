"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert, Label, Textarea } from "@/components/ui/form";
import { type MessageState, reportConversation, sendMessage } from "../actions";

/** Picks up new messages every few seconds while the page is open and visible. */
export function AutoRefresh({ every = 8000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(timer);
  }, [router, every]);
  return null;
}

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState<MessageState, FormData>(sendMessage.bind(null, conversationId), {});
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!body.trim()) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
    setBody("");
  };
  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-2">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Label htmlFor="message-body" className="sr-only">Message</Label>
      <div className="flex items-end gap-2">
        <Textarea
          id="message-body"
          name="body"
          rows={2}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="Write a message"
          className="min-h-12 flex-1"
        />
        <Button type="submit" className="h-12" disabled={pending || !body.trim()} aria-label="Send">
          <Send aria-hidden /> <span className="hidden sm:inline">Send</span>
        </Button>
      </div>
    </form>
  );
}

export function ReportForm({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<MessageState, FormData>(reportConversation.bind(null, conversationId), {});
  if (state.ok) return <p className="text-sm text-muted-foreground">Thanks. GuroMart staff will review this chat.</p>;
  if (!open) {
    return (
      <div>
        <Button type="button" variant="link" size="sm" className="h-9 px-0 text-muted-foreground" onClick={() => setOpen(true)}>
          Report this chat
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-[12px] border border-border p-4">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Label htmlFor="report-reason">What happened?</Label>
      <Textarea id="report-reason" name="reason" rows={3} maxLength={1000} placeholder="e.g. Asked me to pay outside GuroMart" />
      <p className="text-xs text-muted-foreground">Reporting lets GuroMart staff read this chat so they can act on it.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={pending}>{pending ? "Sending…" : "Send report"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
