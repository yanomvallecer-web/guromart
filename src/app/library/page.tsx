import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, Download, FileText } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { getLibrary, getLibraryDetails } from "@/lib/commerce/cart";
import { formatBytes } from "@/lib/format";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My library" };

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
const SOURCE = { purchase: "Bought", free: "Free", grant: "Given by GuroMart" } as const;
const CODE = /^[a-z0-9-]{1,60}$/;

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <PageShell title="My library" description="Resources you own. Download them as often as you need for your classes.">
      <Suspense fallback={<PanelSkeleton />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

const chipClass = (active: boolean) =>
  cn(
    "flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold",
    active ? "border-foreground bg-foreground text-white" : "border-border bg-surface text-foreground hover:border-primary",
  );

async function Library({ searchParams }: { searchParams: PageProps<"/library">["searchParams"] }) {
  await requireViewer("/library");
  const raw = await searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" && CODE.test(v) ? v : undefined);
  const grade = pick(raw.grade);
  const period = pick(raw.period);

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

  const details = await getLibraryDetails(items.map((i) => i.product_id));
  // Filter chips come only from what this teacher actually owns.
  const grades = new Map<string, { name: string; sort: number }>();
  const periods = new Map<string, { name: string; sort: number }>();
  for (const d of details.values()) {
    for (const g of d.grades) grades.set(g.code, g);
    if (d.period) periods.set(d.period.code, d.period);
  }
  const shown = items.filter((item) => {
    const d = details.get(item.product_id);
    return (!grade || d?.grades.some((g) => g.code === grade)) && (!period || d?.period?.code === period);
  });
  const href = (changes: { grade?: string | null; period?: string | null }) => {
    const qs = new URLSearchParams();
    const g = changes.grade === undefined ? grade : changes.grade;
    const p = changes.period === undefined ? period : changes.period;
    if (g) qs.set("grade", g);
    if (p) qs.set("period", p);
    return qs.size ? `/library?${qs}` : "/library";
  };
  const sorted = (m: Map<string, { name: string; sort: number }>) => [...m.entries()].sort((a, b) => a[1].sort - b[1].sort);
  const filtering = Boolean(grade || period);

  return (
    <div className="flex flex-col gap-4">
      {grades.size || periods.size ? (
        <nav aria-label="Filter your library" className="-mx-4 flex flex-col gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            <li>
              <Link href="/library" aria-current={!filtering ? "page" : undefined} className={chipClass(!filtering)}>All</Link>
            </li>
            {sorted(grades).map(([code, g]) => (
              <li key={code}>
                <Link href={href({ grade: grade === code ? null : code })} aria-current={grade === code ? "true" : undefined} className={chipClass(grade === code)}>
                  {g.name}
                </Link>
              </li>
            ))}
            {sorted(periods).map(([code, p]) => (
              <li key={code}>
                <Link href={href({ period: period === code ? null : code })} aria-current={period === code ? "true" : undefined} className={chipClass(period === code)}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shown.length} {shown.length === 1 ? "resource" : "resources"}
        {filtering ? ` of ${items.length}` : ""}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="None of your resources match" action={<Link href="/library" className={buttonVariants({ variant: "outline" })}>Show all</Link>} />
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((item) => {
            const d = details.get(item.product_id);
            return (
              <li key={item.entitlement_id}>
                <Card className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                  <div className="flex aspect-[3/4] w-16 shrink-0 items-center justify-center self-start overflow-hidden rounded-[8px] border border-border bg-accent-soft text-primary/50 sm:w-20">
                    {d?.previewPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={publicObjectUrl("product-previews", d.previewPath)} alt="" loading="lazy" className="size-full bg-surface object-contain" />
                    ) : (
                      <FileText aria-hidden />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {item.is_live ? (
                          <Link href={`/resources/${item.slug}`} className="font-display text-lg font-bold leading-snug hover:text-primary">{item.title}</Link>
                        ) : (
                          <p className="font-display text-lg font-bold leading-snug">{item.title}</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {item.shop_name} · {SOURCE[item.source]} {dateFmt.format(new Date(item.granted_at))}
                        </p>
                        {d && (d.grades.length || d.period) ? (
                          <p className="text-sm text-muted-foreground">{[d.grades.map((g) => g.name).join(", "), d.period?.name].filter(Boolean).join(" · ")}</p>
                        ) : null}
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
                            <a href={`/library/download/${f.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}>
                              <Download aria-hidden /> Download
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">Being checked</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
