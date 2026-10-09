"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { type CartActionState, startCheckout } from "./actions";

export function CheckoutButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CartActionState>({});
  return (
    <div className="flex flex-col gap-3">
      {result.error ? <FormAlert>{result.error}</FormAlert> : null}
      <Button size="lg" className="w-full" disabled={pending} onClick={() => start(async () => setResult(await startCheckout()))}>
        <Lock aria-hidden /> {pending ? "Opening PayMongo…" : "Pay with PayMongo"}
      </Button>
    </div>
  );
}
