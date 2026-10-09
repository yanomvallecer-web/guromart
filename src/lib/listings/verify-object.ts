import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, type CheckedUpload, LIMITS, type UploadKind, checkUpload, matchesSignature } from "./uploads";

/**
 * Checks an object the browser just uploaded with a signed URL: its stored
 * size and content type, and that its first bytes match the claimed type.
 * Anything that fails is deleted, so rejected uploads never linger.
 */
export async function verifyStoredObject(
  kind: UploadKind,
  path: string,
  name: string,
): Promise<{ ok: true; size: number; type: CheckedUpload } | { ok: false; error: string }> {
  const storage = createAdminClient().storage.from(BUCKET[kind]);
  const reject = async (error: string) => {
    await storage.remove([path]);
    return { ok: false as const, error };
  };

  const info = await storage.info(path);
  if (info.error || !info.data) return { ok: false, error: "We couldn't find the uploaded file. Please try again." };
  const size = info.data.size ?? 0;
  const ext = path.slice(path.lastIndexOf(".") + 1);
  const check = checkUpload(kind, `${name.replace(/\.[^.]*$/, "")}.${ext}`, size);
  if (!check.ok) return reject(check.error);
  if (size > LIMITS[kind]) return reject("That file is too large.");
  const meta = info.data as { content_type?: string; contentType?: string };
  const storedType = meta.content_type ?? meta.contentType;
  if (storedType && storedType !== check.value.mime) return reject("That file's type doesn't match its name.");

  // Read only the first bytes to confirm the file really is what its name says.
  const signed = await storage.createSignedUrl(path, 60);
  if (signed.error || !signed.data) return reject("We couldn't check the file. Please try again.");
  // Ask only for bytes that exist (some servers mishandle ranges past the end), and never wait forever.
  let head: Uint8Array;
  try {
    const res = await fetch(signed.data.signedUrl, {
      headers: { Range: `bytes=0-${Math.min(31, size - 1)}` },
      signal: AbortSignal.timeout(10_000),
    });
    head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
  } catch {
    return reject("We couldn't check the file. Please try again.");
  }
  if (!matchesSignature(check.value.format, head)) {
    return reject("This file's contents don't match its type. Save it again as a real PDF, Word, PowerPoint, Excel, ZIP or image file.");
  }
  return { ok: true, size, type: check.value };
}

/** Deletes an object that was checked but then could not be recorded. */
export async function discardObject(kind: UploadKind, path: string) {
  await createAdminClient().storage.from(BUCKET[kind]).remove([path]);
}
