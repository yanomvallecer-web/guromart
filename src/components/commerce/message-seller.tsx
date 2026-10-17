"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startConversation } from "@/app/messages/actions";

/** Opens a chat with the shop. Signed-out visitors are sent to sign in first by the action. */
export function MessageSellerButton({ storefrontId, productId, from, className }: { storefrontId: string; productId?: string; from: string; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className ?? "h-11"}
        disabled={pending}
        onClick={() => start(async () => setError((await startConversation(storefrontId, productId ?? null, from)).error ?? null))}
      >
        <MessageCircle aria-hidden /> {pending ? "Opening…" : "Message the seller"}
      </Button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
