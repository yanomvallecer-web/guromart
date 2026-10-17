"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { type CartActionState, buyBundle } from "@/app/cart/actions";

/** Opens PayMongo for the whole bundle at its one price. */
export function BuyBundleButton({ bundleId, path }: { bundleId: string; path: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CartActionState>({});
  return (
    <div className="flex flex-col gap-3">
      {result.error ? <FormAlert>{result.error}</FormAlert> : null}
      <Button size="lg" className="w-full" disabled={pending} onClick={() => start(async () => setResult(await buyBundle(bundleId, path)))}>
        {pending ? "Opening…" : "Buy the bundle"}
      </Button>
    </div>
  );
}
