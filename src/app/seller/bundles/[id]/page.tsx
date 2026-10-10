import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { getSellerContext } from "@/lib/listings/seller";
import { createClient } from "@/lib/supabase/server";
import { BUNDLE_STATUS } from "@/lib/catalog/bundle-status";
import { BundleControls, BundleEditor } from "../bundle-forms";

export const metadata: Metadata = { title: "Edit bundle" };

export default function EditBundlePage({ params }: PageProps<"/seller/bundles/[id]">) {
  return (
    <PageShell title="Edit bundle" description={<Link href="/seller/bundles" className="text-primary hover:underline">All bundles</Link>}>
      <Suspense fallback={<PanelSkeleton />}>
        <Editor params={params} />
      </Suspense>
    </PageShell>
  );
}

async function Editor({ params }: { params: PageProps<"/seller/bundles/[id]">["params"] }) {
  const { id } = await params;
  const viewer = await requireArea("seller", `/seller/bundles/${id}`);
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: bundle }, { data: resources }] = await Promise.all([
    supabase
      .from("bundles")
      .select("id, slug, title, topic, description, price_centavos, status, bundle_items(product_id, sort_order)")
      .eq("id", id)
      .eq("storefront_id", ctx.storefront.id)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id, title, price_centavos")
      .eq("storefront_id", ctx.storefront.id)
      .eq("status", "published")
      .gt("price_centavos", 0)
      .order("title"),
  ]);
  if (!bundle) notFound();
  const status = BUNDLE_STATUS[bundle.status] ?? BUNDLE_STATUS.draft;
  const selected = [...bundle.bundle_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.product_id);
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="p-6">
        <BundleEditor bundle={bundle} resources={resources ?? []} selected={selected} />
      </Card>
      <Card className="flex h-fit flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Status</h2>
          <Badge className={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          A bundle goes live right away when it has two or more of your live, paid resources and costs less than buying them separately.
        </p>
        <BundleControls id={bundle.id} status={bundle.status} />
        {bundle.status === "published" ? (
          <Link href={`/bundles/${bundle.slug}`} className="text-sm font-semibold text-primary hover:underline">View the bundle page</Link>
        ) : null}
      </Card>
    </div>
  );
}
