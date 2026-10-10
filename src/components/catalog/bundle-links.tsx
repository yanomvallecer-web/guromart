import Link from "next/link";
import { Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { type BundleSummary, bundlesWithProduct, shopBundles } from "@/lib/catalog/bundles";
import { formatPrice } from "@/lib/format";

function BundleList({ bundles, heading }: { bundles: BundleSummary[]; heading: string }) {
  if (bundles.length === 0) return null;
  return (
    <Card className="flex flex-col gap-2 p-5 text-sm" data-testid="bundle-links">
      <h2 className="flex items-center gap-2 font-semibold"><Layers className="size-4 text-primary" aria-hidden /> {heading}</h2>
      <ul className="flex flex-col gap-1">
        {bundles.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/bundles/${b.slug}`} className="font-semibold text-primary hover:underline">{b.topic || b.title}</Link>
            <span className="text-muted-foreground">{formatPrice(b.price_centavos)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export async function ProductBundles({ productId }: { productId: string }) {
  return <BundleList bundles={await bundlesWithProduct(productId)} heading="Also sold in a lesson bundle" />;
}

export async function ShopBundles({ storefrontId }: { storefrontId: string }) {
  return <BundleList bundles={await shopBundles(storefrontId)} heading="Lesson bundles" />;
}
