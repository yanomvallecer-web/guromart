"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert, Label, NativeSelect } from "@/components/ui/form";
import { ACCEPT } from "@/lib/listings/uploads";
import { createClient } from "@/lib/supabase/browser";
import { createIdTicket, submitId } from "./actions";

export function IdUpload({ kinds }: { kinds: { value: string; label: string }[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const file = fileInput.current?.files?.[0];
    if (!kind) return setError("Choose the type of ID.");
    if (!file) return setError("Choose a photo or scan of your ID.");
    setBusy(true);
    setError(null);
    try {
      const ticket = await createIdTicket({ name: file.name, size: file.size });
      if (!ticket.ok) return setError(ticket.error);
      const sent = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (sent.error) return setError("The upload didn't finish. Check your connection and try again.");
      const result = await submitId({ kind, path: ticket.path, name: file.name });
      if (result.error) return setError(result.error);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="id-kind">Type of ID</Label>
        <NativeSelect id="id-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Choose one</option>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="id-file">Photo or scan (PDF, PNG, JPG or WebP, up to 10 MB)</Label>
        <input ref={fileInput} id="id-file" type="file" accept={ACCEPT.verification} className="text-sm" />
      </div>
      <div>
        <Button type="button" onClick={send} disabled={busy}>
          <Upload aria-hidden /> {busy ? "Sending…" : "Send for review"}
        </Button>
      </div>
    </div>
  );
}
