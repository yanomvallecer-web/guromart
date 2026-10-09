"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { ACCEPT } from "@/lib/listings/uploads";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { createShopImageTicket, removeShopImage, setShopImage } from "./actions";

export function ShopImage({ slot, label, hint, url }: { slot: "logo" | "banner"; label: string; hint: string; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ticket = await createShopImageTicket({ name: file.name, size: file.size });
      if (!ticket.ok) return setError(ticket.error);
      const sent = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (sent.error) return setError("The upload didn't finish. Check your connection and try again.");
      const result = await setShopImage({ slot, path: ticket.path, name: file.name });
      if (result.error) return setError(result.error);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const result = await removeShopImage(slot);
    setBusy(false);
    if (result.error) setError(result.error);
    router.refresh();
  }

  const id = `shop-${slot}`;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-bold">{label}</h2>
        <p className="text-sm text-muted-foreground">{hint} PNG, JPG or WebP, up to 5 MB.</p>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className={cn("overflow-hidden rounded-[10px] border border-border bg-surface-muted", slot === "logo" ? "size-28" : "aspect-[4/1] w-full")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Shop ${slot}`} className="size-full object-cover" data-testid={`shop-${slot}-image`} />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden />
          </div>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT.shop}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className={busy ? "pointer-events-none opacity-60" : "cursor-pointer"}>
          <label htmlFor={id}>{busy ? "Working…" : url ? `Replace ${slot}` : `Upload ${slot}`}</label>
        </Button>
        {url ? (
          <Button type="button" variant="ghost" size="sm" className="text-danger" disabled={busy} onClick={remove} aria-label={`Remove ${slot}`}>
            <Trash2 aria-hidden /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
