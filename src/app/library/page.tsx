import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, Download } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { getLibrary } from "@/lib/commerce/cart";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = { title: "My library" };

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
const SOURCE = { purchase: "Bought", free: "Free", grant: "Given by GuroMart" } as const;

export default function LibraryPage() {
  return (
    <PageShell title="My library" description="Resources you own. Download them as often as you need for your classes.">
      <Suspense fallback={<PanelSkeleton />}>
        <Library />
      </Suspense>
    </PageShell>
  );
}

async function Library() {
  await requireViewer("/library");
  const items = await getLibrary();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen />}
        title="Nothing in your library yet"
        action={<Link href="/browse?price=free" className={buttonVariants({ variant: "outline" })}>Find free resources</Link>}
      >
        Resources you get or buy appear here, ready to download.
      </EmptyState>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.entitlement_id}>
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                {item.is_live ? (
                  <Link href={`/resources/${item.slug}`} className="font-display text-lg font-bold hover:text-primary">{item.title}</Link>
                ) : (
                  <p className="font-display text-lg font-bold">{item.title}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {item.shop_name} · {SOURCE[item.source]} {dateFmt.format(new Date(item.granted_at))}
                </p>
              </div>
              {item.is_live ? null : <Badge className="bg-surface-muted text-muted-foreground">No longer sold</Badge>}
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
              {item.files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-medium">{f.name}</span>{" "}
                    <span className="text-muted-foreground">{f.format.toUpperCase()} · {formatBytes(f.size)}</span>
                  </span>
                  {f.available ? (
                    // A plain link: the route checks access, logs the download and redirects to a short-lived file link.
                    <a href={`/library/download/${f.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Download aria-hidden /> Download
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">Being checked</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ul>
  );
}
