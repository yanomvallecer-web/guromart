"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { type CartActionState, addToCart, buyNow, getFreeResource } from "@/app/cart/actions";

/**
 * Get it free, or Add to cart, plus Buy now when offered. Buy now opens
 * PayMongo for this one resource only; the rest of the cart is not charged.
 */
export function BuyButton({
  productId,
  path,
  free,
  offerBuyNow = false,
  inCart = false,
}: {
  productId: string;
  path: string;
  free: boolean;
  offerBuyNow?: boolean;
  /** Already in the cart: link there instead of adding it again. */
  inCart?: boolean;
}) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<"cart" | "buy" | null>(null);
  const [result, setResult] = useState<CartActionState>({});
  const run = (which: "cart" | "buy", action: () => Promise<CartActionState>) => {
    setRunning(which);
    start(async () => setResult(await action()));
  };

  return (
    <div className="flex flex-col gap-3">
      {result.error ? <FormAlert>{result.error}</FormAlert> : null}
      {free ? (
        <Button size="lg" className="w-full" disabled={pending} onClick={() => run("cart", () => getFreeResource(productId, path))}>
          {pending ? "Working…" : "Get it free"}
        </Button>
      ) : (
        <div className={offerBuyNow ? "grid grid-cols-2 gap-2" : "flex"}>
          {inCart ? (
            <Link href="/cart" className={buttonVariants({ variant: "outline", size: "lg", className: "w-full px-3" })}>
              <ShoppingCart aria-hidden /> In your cart
            </Link>
          ) : (
            <Button
              size="lg"
              variant={offerBuyNow ? "outline" : "primary"}
              className="w-full px-3"
              disabled={pending}
              onClick={() => run("cart", () => addToCart(productId, path))}
            >
              {pending && running === "cart" ? "Adding…" : "Add to cart"}
            </Button>
          )}
          {offerBuyNow ? (
            <Button size="lg" className="w-full px-3" disabled={pending} onClick={() => run("buy", () => buyNow(productId, path))}>
              {pending && running === "buy" ? "Opening…" : "Buy now"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
