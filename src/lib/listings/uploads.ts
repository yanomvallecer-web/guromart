/** What sellers may upload. Resource files go to a private bucket; previews to a public one. */

/** Matches the limit in the database (private.limit_product_media). */
export const MAX_PREVIEWS = 6;

export type UploadKind = "file" | "preview" | "verification" | "shop";

type FileType = { ext: string[]; mime: string; format: string; magic: (b: Uint8Array) => boolean };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isPng = (b: Uint8Array) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (b: Uint8Array) => startsWith(b, [0xff, 0xd8, 0xff]);
const isWebp = (b: Uint8Array) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);

const FILE_TYPES: FileType[] = [
  { ext: ["pdf"], mime: "application/pdf", format: "pdf", magic: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { ext: ["docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", format: "docx", magic: isZip },
  { ext: ["pptx"], mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", format: "pptx", magic: isZip },
  { ext: ["xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", format: "xlsx", magic: isZip },
  { ext: ["zip"], mime: "application/zip", format: "zip", magic: isZip },
  { ext: ["png"], mime: "image/png", format: "png", magic: isPng },
  { ext: ["jpg", "jpeg"], mime: "image/jpeg", format: "jpg", magic: isJpeg },
  { ext: ["webp"], mime: "image/webp", format: "webp", magic: isWebp },
];

const ALLOWED_FORMATS: Record<UploadKind, Set<string> | null> = {
  file: null,
  preview: new Set(["png", "jpg", "webp"]),
  verification: new Set(["pdf", "png", "jpg", "webp"]),
  shop: new Set(["png", "jpg", "webp"]),
};

const TYPE_ERROR: Record<UploadKind, string> = {
  file: "Upload PDF, Word, PowerPoint, Excel, ZIP or image files.",
  preview: "Previews must be PNG, JPG or WebP images.",
  verification: "Upload a PDF or a PNG, JPG or WebP photo.",
  shop: "Shop images must be PNG, JPG or WebP.",
};

export const LIMITS = {
  file: 100 * 1024 * 1024,
  preview: 5 * 1024 * 1024,
  verification: 10 * 1024 * 1024,
  shop: 5 * 1024 * 1024,
} as const satisfies Record<UploadKind, number>;

export const ACCEPT = {
  file: ".pdf,.docx,.pptx,.xlsx,.zip,.png,.jpg,.jpeg,.webp",
  preview: ".png,.jpg,.jpeg,.webp",
  verification: ".pdf,.png,.jpg,.jpeg,.webp",
  shop: ".png,.jpg,.jpeg,.webp",
} as const satisfies Record<UploadKind, string>;

export const BUCKET = { file: "product-files", preview: "product-previews", verification: "verification-documents", shop: "storefront-media" } as const satisfies Record<UploadKind, string>;

export type CheckedUpload = { ext: string; mime: string; format: string };

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Validates a proposed upload by name and size. The browser's MIME type is
 * not trusted: the type comes from the extension and is later checked against
 * the file's first bytes.
 */
export function checkUpload(kind: UploadKind, name: string, size: number): { ok: true; value: CheckedUpload } | { ok: false; error: string } {
  if (!name || name.length > 255) return { ok: false, error: "The file name is missing or too long." };
  const ext = extensionOf(name);
  const type = FILE_TYPES.find((t) => t.ext.includes(ext));
  const allowed = ALLOWED_FORMATS[kind];
  if (!type || (allowed && !allowed.has(type.format))) return { ok: false, error: TYPE_ERROR[kind] };
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: "The file is empty." };
  if (size > LIMITS[kind]) return { ok: false, error: `Files must be ${LIMITS[kind] / 1024 / 1024} MB or smaller.` };
  return { ok: true, value: { ext: type.ext[0], mime: type.mime, format: type.format } };
}

/** True when the file's first bytes match what its extension claims. */
export function matchesSignature(format: string, head: Uint8Array): boolean {
  const type = FILE_TYPES.find((t) => t.format === format);
  return Boolean(type && head.length >= 12 && type.magic(head));
}

/** Keeps a readable, safe original file name for buyers' downloads. */
export function cleanFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "_")
    .trim();
  return (cleaned || "file").slice(-200);
}

/** Storage object path; the first two segments are enforced by storage and table policies. */
export function objectPath(sellerAccountId: string, productId: string, ext: string, id: string = crypto.randomUUID()) {
  return `${sellerAccountId}/${productId}/${id}.${ext}`;
}
