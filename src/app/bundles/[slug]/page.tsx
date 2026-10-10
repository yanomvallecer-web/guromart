import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/catalog/product-card";
import { BuyBundleButton } from "@/components/commerce/buy-bundle-button";
import { WebCheckoutOnly } from "@/components/site/android-app";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/dal";
import { getBundle } from "@/lib/catalog/bundles";
import { formatPrice } from "@/lib/format";
import { paymentMethodsShort, paymentsReady } from "@/lib/payments/paymongo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { setBundleHidden } from "../actions";

export async function generateMetadata({ params }: PageProps<"/bundles/[slug]">): Promise<Metadata> {
  const bundle = await getBundle((await params).slug);
  return bundle ? { title: bundle.title, description: bundle.topic ?? undefined } : { title: "Bundle not found" };
}

export default function BundlePage({ params }: PageProps<"/bundles/[slug]">) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 sm:py-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-border/50" />}>
        <Bundle params={params} />
      </Suspense>
    </div>
  );
}

async function Bundle({ params }: { params: PageProps<"/bundles/[slug]">["params"] }) {
  const bundle = await getBundle((await params).slug);
  if (!bundle) notFound();
  const path = `/bundles/${bundle.slug}`;
  const viewer = await getViewer();
  const isAdmin = Boolean(viewer?.roles.includes("admin"));
  const saving = bundle.separate_centavos - bundle.price_centavos;

  // Which resources the viewer already has: a bundle can't be bought twice over.
  let owned = 0;
  if (viewer && bundle.items.length) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("entitlements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.id)
      .is("revoked_at", null)
      .in("product_id", bundle.items.map((i) => i.id));
    owned = count ?? 0;
  }

  let action: React.ReactNode;
  if (bundle.status !== "published") {
    action = <p className="text-sm text-muted-foreground">This bundle isn&apos;t live, so teachers can&apos;t buy it.</p>;
  } else if (!viewer) {
    action = (
      <WebCheckoutOnly>
        <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>Sign in to buy</Link>
      </WebCheckoutOnly>
    );
  } else if (owned === bundle.items.length) {
    action = <Link href="/library" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>All of these are in your library</Link>;
  } else if (owned > 0) {
    action = <p className="text-sm">You already have {owned} of these resources, so the bundle can&apos;t be bought. Get the others one by one below.</p>;
  } else if (!paymentsReady()) {
    action = <p className="text-sm text-muted-foreground">Online payment is paused right now. Please check back soon.</p>;
  } else {
    action = (
      <WebCheckoutOnly>
        <BuyBundleButton bundleId={bundle.id} path={path} />
      </WebCheckoutOnly>
    );
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          Lesson bundle · {bundle.items.length} resources
          {bundle.status !== "published" ? <Badge className="ml-2 bg-surface-muted">{bundle.status === "hidden" ? "Hidden" : "Draft"}</Badge> : null}
        </p>
        <h1 className="font-display text-[28px] font-bold leading-tight sm:text-3xl">{bundle.topic || bundle.title}</h1>
        {bundle.topic ? <p className="text-[15px] text-muted-foreground">{bundle.title}</p> : null}
        {bundle.storefront ? (
          <p className="text-[15px] text-muted-foreground">
            by <Link href={`/shop/${bundle.storefront.slug}`} className="font-semibold text-primary hover:underline">{bundle.storefront.name}</Link>
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="flex flex-col gap-4">
          {bundle.description ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{bundle.description}</p> : null}
          <h2 className="font-display text-xl font-bold">What&apos;s in the bundle</h2>
          <ProductGrid products={bundle.items} className="lg:grid-cols-2 xl:grid-cols-2" />
        </div>
        <Card className="order-first flex flex-col gap-3 p-5 lg:sticky lg:top-24 lg:order-none" data-testid="bundle-buy">
          <p className="font-display text-3xl font-bold leading-none">{formatPrice(bundle.price_centavos)}</p>
          {saving > 0 ? (
            <p className="text-sm">
              <span className="text-muted-foreground line-through">{formatPrice(bundle.separate_centavos)}</span> if bought separately.{" "}
              <span className="font-semibold text-success">You save {formatPrice(saving)}.</span>
            </p>
          ) : null}
          <p data-web-checkout className="text-xs text-muted-foreground">{paymentMethodsShort()}</p>
          {action}
          <p className="text-xs text-muted-foreground">All {bundle.items.length} resources go to your library once PayMongo confirms the payment.</p>
          {isAdmin ? (
            <form action={setBundleHidden.bind(null, bundle.id, bundle.status !== "hidden")} className="border-t border-border pt-3">
              <Button type="submit" variant={bundle.status === "hidden" ? "outline" : "danger"} size="sm" className="h-11">
                {bundle.status === "hidden" ? "Unhide (back to draft)" : "Hide bundle (staff)"}
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </article>
  );
}
