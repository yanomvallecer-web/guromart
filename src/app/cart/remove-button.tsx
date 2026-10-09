"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeFromCart } from "./actions";

export function RemoveFromCart({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove from cart"
      disabled={pending}
      onClick={() => start(async () => void (await removeFromCart(productId)))}
    >
      <X aria-hidden />
    </Button>
  );
}
