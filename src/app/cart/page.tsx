import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, ShoppingCart } from "lucide-react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { WebCheckoutOnly } from "@/components/site/android-app";
import { requireViewer } from "@/lib/auth/dal";
import { getCart } from "@/lib/commerce/cart";
import { formatPrice } from "@/lib/format";
import { paymongoConfig } from "@/lib/payments/paymongo";
import { publicObjectUrl } from "@/lib/storage";
import { CheckoutButton } from "./checkout-button";
import { RemoveFromCart } from "./remove-button";

export const metadata: Metadata = { title: "Your cart" };

export default function CartPage() {
  return (
    <PageShell title="Your cart" description="Prices are checked again when you pay.">
      <Suspense fallback={<PanelSkeleton />}>
        <CartContents />
      </Suspense>
    </PageShell>
  );
}

async function CartContents() {
  const viewer = await requireViewer("/cart");
  const cart = await getCart(viewer);

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart />}
        title="Your cart is empty"
        action={<Link href="/browse" className={buttonVariants({ variant: "outline" })}>Browse resources</Link>}
      >
        Paid resources you add will wait here. Free ones go straight to your library.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <ul className="flex flex-col gap-3">
        {cart.lines.map((line) => (
          <li key={line.productId}>
            <Card className="flex items-center gap-4 p-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-accent-soft text-primary/50">
                {line.product?.previewPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicObjectUrl("product-previews", line.product.previewPath)} alt="" className="size-full object-cover" />
                ) : (
                  <FileText aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {line.product ? (
                  <>
                    <Link href={`/resources/${line.product.slug}`} className="line-clamp-2 font-semibold hover:text-primary">
                      {line.product.title}
                    </Link>
                    {line.product.shop ? <p className="text-sm text-muted-foreground">{line.product.shop.name}</p> : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">This resource is no longer available and won&apos;t be charged.</p>
                )}
              </div>
              <p className="shrink-0 font-semibold">{line.product ? formatPrice(line.product.priceCentavos) : null}</p>
              <RemoveFromCart productId={line.productId} />
            </Card>
          </li>
        ))}
      </ul>

      <div>
        <WebCheckoutOnly>
          {paymongoConfig() && cart.buyableCount ? (
            // On phones the total and Pay button sit in a bar above the tab bar; from md up, a summary card.
            <Card
              data-testid="checkout-bar"
              data-stacked-bar
              className="flex h-fit flex-col gap-3 p-5 max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(var(--bottom-bar)+env(safe-area-inset-bottom))] max-md:z-30 max-md:flex-row max-md:items-center max-md:gap-3 max-md:rounded-none max-md:border-x-0 max-md:px-4 max-md:py-2 max-md:shadow-[0_-4px_16px_rgb(21_35_63/0.08)]"
            >
              <h2 className="font-display text-lg font-bold max-md:sr-only">Summary</h2>
              <div className="flex justify-between text-sm max-md:shrink-0 max-md:flex-col">
                <span className="max-md:text-xs max-md:text-muted-foreground">{cart.buyableCount} {cart.buyableCount === 1 ? "resource" : "resources"}</span>
                <span className="font-semibold max-md:font-display max-md:text-xl max-md:font-bold">{formatPrice(cart.totalCentavos)}</span>
              </div>
              <div className="min-w-0 flex-1 md:flex-none">
                <CheckoutButton />
              </div>
              <p className="text-xs text-muted-foreground max-md:hidden">
                You&apos;ll pay on PayMongo&apos;s secure page with GCash, Maya or a card. Test mode: no real money moves.
              </p>
            </Card>
          ) : (
            <Card className="flex h-fit flex-col gap-3 p-5">
              <h2 className="font-display text-lg font-bold">Summary</h2>
              <div className="flex justify-between text-sm">
                <span>{cart.buyableCount} {cart.buyableCount === 1 ? "resource" : "resources"}</span>
                <span className="font-semibold">{formatPrice(cart.totalCentavos)}</span>
              </div>
              {paymongoConfig() ? null : (
                <p className="rounded-[10px] bg-surface-muted p-3 text-sm text-muted-foreground">
                  Online payment is not open yet. Your cart is saved, and you&apos;ll be able to pay with GCash, Maya or a card once checkout opens.
                </p>
              )}
            </Card>
          )}
        </WebCheckoutOnly>
      </div>
    </div>
  );
}
