import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessageSquare } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Stars } from "@/components/catalog/reviews";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { setReviewStatus } from "./actions";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

type Row = {
  id: string;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  created_at: string;
  seller_reply: string | null;
  products: { slug: string; title: string } | null;
};

export default function AdminReviewsPage() {
  return (
    <PageShell title="Reviews" description="The newest reviews from verified buyers. Hide any that break the rules; hidden reviews stop counting toward the rating.">
      <Suspense fallback={<PanelSkeleton />}>
        <List />
      </Suspense>
    </PageShell>
  );
}

async function List() {
  await requireArea("admin", "/admin/reviews");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, body, status, created_at, seller_reply, products(slug, title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load reviews: ${error.message}`);
  const rows = data as unknown as Row[];
  if (rows.length === 0) return <EmptyState icon={<MessageSquare />} title="No reviews yet" />;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Card className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars rating={r.rating} />
                {r.products ? (
                  <Link href={`/resources/${r.products.slug}`} className="font-semibold text-primary hover:underline">{r.products.title}</Link>
                ) : null}
                <span className="text-sm text-muted-foreground">{when.format(new Date(r.created_at))}</span>
                {r.status === "hidden" ? <Badge className="bg-danger-soft text-danger">Hidden</Badge> : null}
              </div>
              <form action={setReviewStatus.bind(null, r.id, r.status === "hidden" ? "published" : "hidden")}>
                <Button type="submit" size="sm" variant={r.status === "hidden" ? "outline" : "danger"} className="h-11">
                  {r.status === "hidden" ? "Show again" : "Hide"}
                </Button>
              </form>
            </div>
            {r.body ? <p className="whitespace-pre-line text-[15px]">{r.body}</p> : <p className="text-sm text-muted-foreground">Rating only, no text.</p>}
            {r.seller_reply ? <p className="text-sm text-muted-foreground">Seller replied: {r.seller_reply}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
