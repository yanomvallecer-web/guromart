"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { type CartActionState, addToCart, getFreeResource } from "@/app/cart/actions";

export function BuyButton({ productId, path, free }: { productId: string; path: string; free: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CartActionState>({});
  const run = () => start(async () => setResult(await (free ? getFreeResource(productId, path) : addToCart(productId, path))));

  return (
    <div className="flex flex-col gap-3">
      {result.error ? <FormAlert>{result.error}</FormAlert> : null}
      <Button size="lg" disabled={pending} onClick={run}>
        {pending ? "Working…" : free ? "Get it free" : "Add to cart"}
      </Button>
    </div>
  );
}
