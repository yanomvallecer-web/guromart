import type { Metadata } from "next";
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { listNotifications } from "@/lib/account/notifications";
import { requireViewer } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";
import { markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

export default function NotificationsPage() {
  return (
    <PageShell title="Notifications" description="New resources from shops you follow. These show here on GuroMart; we don't send them by email.">
      <Suspense fallback={<PanelSkeleton />}>
        <List />
      </Suspense>
    </PageShell>
  );
}

async function List() {
  const viewer = await requireViewer("/notifications");
  const items = await listNotifications(viewer.id);
  if (items.length === 0) {
    return (
      <EmptyState icon={<Bell />} title="No notifications yet">
        Follow a shop and you&apos;ll see its new resources here.
      </EmptyState>
    );
  }
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread ? (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm" className="h-11">Mark all as read</Button>
          </form>
        ) : null}
      </div>
      <Card className="divide-y divide-border overflow-hidden">
        {items.map((n) => (
          <form key={n.id} action={openNotification.bind(null, n.id)}>
            <button type="submit" className={cn("flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-surface-muted", !n.read_at && "bg-primary-soft/40")}>
              <span className="flex w-full items-center gap-2">
                {!n.read_at ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" role="img" /> : null}
                <span className="font-semibold">{n.title}</span>
              </span>
              {n.body ? <span className="text-[15px]">{n.body}</span> : null}
              <span className="text-xs text-muted-foreground">{when.format(new Date(n.created_at))}</span>
            </button>
          </form>
        ))}
      </Card>
    </div>
  );
}
