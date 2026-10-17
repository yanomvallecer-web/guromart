import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card, EmptyState } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { listConversations } from "@/lib/messages/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

export default function MessagesPage() {
  return (
    <PageShell title="Messages" description="Chats between teachers and shops. Only the two of you can read them unless one of you reports the chat.">
      <Suspense fallback={<PanelSkeleton />}>
        <List />
      </Suspense>
    </PageShell>
  );
}

async function List() {
  await requireViewer("/messages");
  const items = await listConversations();
  if (items.length === 0) {
    return (
      <EmptyState icon={<MessageCircle />} title="No messages yet" action={<Link href="/browse" className="font-semibold text-primary hover:underline">Browse resources</Link>}>
        Use &ldquo;Message the seller&rdquo; on any resource or shop to ask a question.
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/messages/${c.id}`}
          data-testid="conversation"
          className={cn("flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-muted", c.unread && "bg-primary-soft/40")}
        >
          <span className="flex items-center gap-2">
            {c.unread ? <span className="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unread" data-testid="unread-dot" /> : null}
            <span className="truncate font-semibold">{c.other_name}</span>
            <span className="shrink-0 rounded-full bg-surface-muted px-2 text-xs text-muted-foreground">{c.role === "seller" ? "Your shop" : "Shop"}</span>
          </span>
          {c.product_title ? <span className="truncate text-sm text-muted-foreground">About: {c.product_title}</span> : null}
          <span className="truncate text-[15px]">{c.last_body ?? "No messages yet"}</span>
          {c.last_message_at ? <span className="text-xs text-muted-foreground">{when.format(new Date(c.last_message_at))}</span> : null}
        </Link>
      ))}
    </Card>
  );
}
