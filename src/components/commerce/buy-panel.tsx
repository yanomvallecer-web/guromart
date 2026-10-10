import Link from "next/link";
import { BookOpenCheck, ShoppingCart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/dal";
import { buyNowReady } from "@/lib/commerce/buy-now";
import { getProductAccess } from "@/lib/commerce/cart";
import { paymongoConfig } from "@/lib/payments/paymongo";
import { cn } from "@/lib/utils";
import { WebCheckoutOnly } from "@/components/site/android-app";
import { BuyButton } from "./buy-button";

/** What the viewer can do with a resource: sign in, get it free, add to cart, or open it in their library. */
export async function BuyPanel({ productId, slug, free }: { productId: string; slug: string; free: boolean }) {
  const path = `/resources/${slug}`;
  // Paid buying is hidden inside the Android app; free resources and the library stay.
  const webOnly = (node: React.ReactNode) => (free ? node : <WebCheckoutOnly>{node}</WebCheckoutOnly>);
  const viewer = await getViewer();
  if (!viewer) {
    return webOnly(
      <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        {free ? "Sign in to get it free" : "Sign in to buy"}
      </Link>,
    );
  }

  const access = await getProductAccess(viewer, productId);
  if (access === "owner") {
    return <p className="text-sm text-muted-foreground">This is your resource. Teachers can get it from this page.</p>;
  }
  if (access === "owned") {
    return (
      <Link href="/library" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
        <BookOpenCheck aria-hidden /> Open in library
      </Link>
    );
  }
  // Buy now needs online payment and its database function (see lib/commerce/buy-now.ts).
  const offerBuyNow = !free && Boolean(paymongoConfig()) && (await buyNowReady());
  if (access === "in_cart") {
    if (offerBuyNow) return webOnly(<BuyButton productId={productId} path={path} free={false} offerBuyNow inCart />);
    return webOnly(
      <Link href="/cart" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
        <ShoppingCart aria-hidden /> In your cart
      </Link>,
    );
  }
  return webOnly(<BuyButton productId={productId} path={path} free={free} offerBuyNow={offerBuyNow} />);
}
