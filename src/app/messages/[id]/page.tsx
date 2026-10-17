import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { getConversation } from "@/lib/messages/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { clearReport } from "../actions";
import { AutoRefresh, Composer, ReportForm } from "./chat-forms";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <PageShell title="Messages" description={<Link href="/messages" className="text-primary hover:underline">All messages</Link>}>
      <Suspense fallback={<PanelSkeleton />}>
        <Conversation params={params} />
      </Suspense>
    </PageShell>
  );
}

async function Conversation({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params;
  const viewer = await requireViewer(`/messages/${id}`);
  const convo = await getConversation(id);
  if (!convo) notFound();
  const { header, messages } = convo;
  if (header.role !== "staff") {
    const supabase = await createClient();
    await supabase.rpc("mark_conversation_read", { p_conversation_id: id });
  }
  const title = header.role === "seller" ? header.buyer_name : header.shop_name;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <AutoRefresh />
      <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">
            {header.role === "buyer" ? <Link href={`/shop/${header.shop_slug}`} className="hover:text-primary hover:underline">{title}</Link> : title}
            {header.role === "staff" ? <span className="text-base font-normal text-muted-foreground"> and {header.shop_name}</span> : null}
          </h2>
          {header.product_title ? (
            <p className="truncate text-sm text-muted-foreground">
              About:{" "}
              {header.product_slug ? (
                <Link href={`/resources/${header.product_slug}`} className="text-primary hover:underline">{header.product_title}</Link>
              ) : (
                header.product_title
              )}
            </p>
          ) : null}
        </div>
      </Card>

      {header.role === "staff" ? (
        <Card className="flex flex-col gap-2 border-danger/40 p-4 text-sm">
          <p className="font-semibold">Reported conversation</p>
          {header.report_reason ? <p>Reason: {header.report_reason}</p> : null}
          <form action={clearReport.bind(null, id)}>
            <Button type="submit" variant="outline" size="sm" className="h-11">Close the report</Button>
          </form>
        </Card>
      ) : null}

      <ol className="flex flex-col gap-2" aria-label="Messages" data-testid="messages">
        {messages.length === 0 ? <li className="text-sm text-muted-foreground">No messages yet. Say hello and ask your question.</li> : null}
        {messages.map((m) => {
          const mine = m.sender_id === viewer.id;
          return (
            <li key={m.id} className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}>
              <p className={cn("max-w-[85%] whitespace-pre-line break-words rounded-[14px] px-3.5 py-2 text-[15px]", mine ? "bg-primary text-primary-foreground" : "bg-surface border border-border")}>
                <span className="sr-only">{mine ? "You: " : `${header.role === "staff" ? "" : title + ": "}`}</span>
                {m.body}
              </p>
              <span className="text-xs text-muted-foreground">{when.format(new Date(m.created_at))}</span>
            </li>
          );
        })}
      </ol>

      {header.role !== "staff" ? (
        <>
          <Composer conversationId={id} />
          <p className="text-xs text-muted-foreground">
            Keep payments on GuroMart: buying through checkout is what protects you and unlocks downloads. Never share passwords or one-time codes.
          </p>
          {header.reported ? (
            <p className="text-sm text-muted-foreground">This chat was reported. GuroMart staff will review it.</p>
          ) : (
            <ReportForm conversationId={id} />
          )}
        </>
      ) : null}
    </div>
  );
}
