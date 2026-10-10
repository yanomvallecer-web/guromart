import type { UploadKind } from "@/lib/listings/uploads";
import { createClient } from "@/lib/supabase/browser";
import { confirmUpload, createUploadTicket } from "../actions";

/** Uploads each file through a signed ticket and confirms it; returns one message per file that failed. */
export async function uploadAll(listingId: string, kind: UploadKind, all: File[], setProgress: (p: string) => void): Promise<string[]> {
  const supabase = createClient();
  const failed: string[] = [];
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
  return failed;
}
