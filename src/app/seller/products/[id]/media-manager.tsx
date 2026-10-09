"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form";
import { ACCEPT, type UploadKind } from "@/lib/listings/uploads";
import { createClient } from "@/lib/supabase/browser";
import { confirmUpload, createUploadTicket, removeMedia } from "../actions";

type FileRow = { id: string; original_filename: string; file_format: string; size_bytes: number; scan_status: string };
type PreviewRow = { id: string; url: string; alt: string | null };

const SCAN_LABEL: Record<string, string> = {
  pending: "Waiting for safety check",
  clean: "Checked",
  infected: "Blocked: failed safety check",
  error: "Safety check failed, will retry",
};

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MediaManager({ listingId, editable, files, previews }: { listingId: string; editable: boolean; files: FileRow[]; previews: PreviewRow[] }) {
  return (
    <>
      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-xl font-bold">Files buyers download</h2>
          <p className="text-sm text-muted-foreground">
            PDF, Word, PowerPoint, Excel, ZIP or images, up to 100 MB each and 10 files per resource. Files are stored privately and only buyers get
            a download link.
          </p>
        </div>
        {files.length ? (
          <ul className="divide-y divide-border rounded-[10px] border border-border" data-testid="file-list">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="size-5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{f.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.file_format.toUpperCase()} · {size(f.size_bytes)} · {SCAN_LABEL[f.scan_status] ?? f.scan_status}
                    </p>
                  </div>
                </div>
                {editable ? <RemoveButton listingId={listingId} kind="file" mediaId={f.id} label={f.original_filename} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {editable ? <Uploader listingId={listingId} kind="file" label="Upload files" /> : <LockedNote />}
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-xl font-bold">Preview images</h2>
          <p className="text-sm text-muted-foreground">
            Public images that show what&apos;s inside, such as a cover and sample pages. PNG, JPG or WebP, up to 5 MB, 6 images at most.
          </p>
        </div>
        {previews.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="preview-list">
            {previews.map((p) => (
              <li key={p.id} className="relative overflow-hidden rounded-[10px] border border-border bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt ?? "Preview image"} className="aspect-[4/3] w-full object-cover" />
                {editable ? (
                  <div className="absolute right-1 top-1">
                    <RemoveButton listingId={listingId} kind="preview" mediaId={p.id} label="preview image" />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {editable ? <Uploader listingId={listingId} kind="preview" label="Add preview images" /> : <LockedNote />}
      </Card>
    </>
  );
}

function LockedNote() {
  return <p className="text-sm text-muted-foreground">Unpublish the resource to a draft to change its files.</p>;
}

function Uploader({ listingId, kind, label }: { listingId: string; kind: UploadKind; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(list: FileList) {
    const supabase = createClient();
    const failed: string[] = [];
    const all = Array.from(list);
    for (const [i, file] of all.entries()) {
      setProgress(`Uploading ${file.name} (${i + 1} of ${all.length})…`);
      const ticket = await createUploadTicket(listingId, { kind, name: file.name, size: file.size });
      if (!ticket.ok) {
        failed.push(`${file.name}: ${ticket.error}`);
        continue;
      }
      const sent = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (sent.error) {
        failed.push(`${file.name}: the upload didn't finish. Check your connection and try again.`);
        continue;
      }
      setProgress(`Checking ${file.name}…`);
      const confirmed = await confirmUpload(listingId, { kind, path: ticket.path, name: file.name });
      if (confirmed.error) failed.push(`${file.name}: ${confirmed.error}`);
    }
    setProgress(null);
    setErrors(failed);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const id = `upload-${kind}`;
  return (
    <div className="flex flex-col gap-2">
      {errors.length ? (
        <FormAlert>
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </FormAlert>
      ) : null}
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept={ACCEPT[kind]}
        className="sr-only"
        disabled={progress !== null}
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className={progress ? "pointer-events-none opacity-60" : "cursor-pointer"}>
          <label htmlFor={id}>
            {kind === "file" ? <Upload aria-hidden /> : <ImageIcon aria-hidden />} {label}
          </label>
        </Button>
        {progress ? (
          <span role="status" className="text-sm text-muted-foreground">
            {progress}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RemoveButton({ listingId, kind, mediaId, label }: { listingId: string; kind: UploadKind; mediaId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-9 bg-surface/90 text-danger"
      disabled={pending}
      aria-label={`Remove ${label}`}
      onClick={() =>
        start(async () => {
          const r = await removeMedia(listingId, kind, mediaId);
          if (r.error) alert(r.error);
          router.refresh();
        })
      }
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
