import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { getSellerContext } from "@/lib/listings/seller";
import { publicObjectUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { ShopForm } from "./shop-form";
import { ShopImage } from "./shop-image";

export const metadata: Metadata = { title: "Shop profile" };

export default function ShopSettingsPage() {
  return (
    <PageShell
      title="Shop profile"
      description="How your shop appears to teachers."
      actions={<Link href="/seller" className="text-sm font-semibold text-primary hover:underline">Seller dashboard</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Settings />
      </Suspense>
    </PageShell>
  );
}

async function Settings() {
  const viewer = await requireArea("seller", "/seller/shop");
  const ctx = await getSellerContext(viewer);
  if (!ctx) redirect("/sell");
  const supabase = await createClient();
  const [{ data: shop }, { data: account }] = await Promise.all([
    supabase.from("storefronts").select("slug, name, tagline, description, logo_path, banner_path, is_published").eq("id", ctx.storefront.id).single(),
    supabase.from("seller_accounts").select("status").eq("id", ctx.sellerAccountId).single(),
  ]);
  if (!shop) redirect("/seller");
  const url = (p: string | null) => (p ? publicObjectUrl("storefront-media", p) : null);
  const visibility =
    account?.status === "active"
      ? shop.is_published
        ? "Your shop is visible to teachers."
        : "Your shop is hidden. Turn on \"Show my shop\" to make it visible again."
      : "Your shop goes live when GuroMart approves your first resource.";

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="flex flex-col gap-4 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Shop address</p>
          <p className="font-semibold">guromart.ph/shop/{shop.slug}</p>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="shop-visibility">{visibility}</p>
          {account?.status === "active" && shop.is_published ? (
            <Link href={`/shop/${shop.slug}`} className="text-sm font-semibold text-primary hover:underline">View your shop</Link>
          ) : null}
        </div>
        <ShopForm
          values={{ name: shop.name, tagline: shop.tagline ?? "", description: shop.description ?? "", is_published: shop.is_published }}
          canPublish={account?.status === "active"}
        />
      </Card>
      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <ShopImage slot="logo" label="Logo" hint="A square image, at least 256 × 256 pixels." url={url(shop.logo_path)} />
        </Card>
        <Card className="p-6">
          <ShopImage slot="banner" label="Banner" hint="A wide image, about 1600 × 400 pixels." url={url(shop.banner_path)} />
        </Card>
      </div>
    </div>
  );
}
