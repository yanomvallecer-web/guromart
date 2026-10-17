/**
 * Turns the first pages of a resource file (PDF, Word, PowerPoint or an image)
 * into JPEG preview images, in the seller's browser. Nothing is uploaded here;
 * the caller uploads the pictures through the normal preview upload.
 */
import { PAGE_PREVIEW_FORMATS } from "./uploads";
import { SLIDE_IMAGE_WIDTH, renderSlideImages, toPreviewJpeg, type SlideImage } from "./slide-images";

export type PreviewableFormat = "pptx" | "pdf" | "docx" | "png" | "jpg" | "webp";

export function isPreviewable(format: string): format is PreviewableFormat {
  return PAGE_PREVIEW_FORMATS.has(format);
}

/** The format of a file the seller picked, from its name. */
export function formatOfName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext === "jpeg" ? "jpg" : ext;
}

/** Draws up to `max` pages starting at page `from` (0-based). */
export async function renderPageImages(
  file: Blob,
  format: PreviewableFormat,
  max: number,
  onProgress?: (done: number, total: number) => void,
  from = 0,
): Promise<{ total: number; images: SlideImage[] }> {
  if (format === "pptx") return renderSlideImages(file, max, onProgress, from);
  if (format === "pdf") return renderPdf(file, max, onProgress, from);
  if (format === "docx") return renderDocx(file, max, onProgress, from);
  return renderPicture(file);
}

async function done(drawn: HTMLCanvasElement, index: number, images: SlideImage[]) {
  const blob = await toPreviewJpeg(drawn);
  if (blob) images.push({ index, blob, url: URL.createObjectURL(blob) });
}

async function renderPdf(file: Blob, max: number, onProgress: ((done: number, total: number) => void) | undefined, from: number) {
  // The legacy build carries polyfills for the newest JavaScript it uses, so it works on older phones too.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Loading the worker code on the page makes pdf.js run here, with no separate worker file to serve.
  // @ts-expect-error The worker build ships without type declarations; it's imported only for its side effect.
  await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const images: SlideImage[] = [];
  try {
    const total = doc.numPages;
    const first = Math.min(from, Math.max(total - 1, 0));
    const count = Math.min(max, total - first);
    for (let i = 0; i < count; i++) {
      onProgress?.(i, count);
      const page = await doc.getPage(first + i + 1);
      const viewport = page.getViewport({ scale: SLIDE_IMAGE_WIDTH / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      await done(canvas, first + i, images);
      page.cleanup();
    }
    onProgress?.(count, count);
    return { total, images };
  } finally {
    await task.destroy();
  }
}

async function renderDocx(file: Blob, max: number, onProgress: ((done: number, total: number) => void) | undefined, from: number) {
  const [{ renderAsync }, { toCanvas }] = await Promise.all([import("docx-preview"), import("html-to-image")]);
  // The document is laid out off screen as pages, then each page is photographed.
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  Object.assign(stage.style, { position: "fixed", left: "-100000px", top: "0", background: "#ffffff" });
  document.body.appendChild(stage);
  const images: SlideImage[] = [];
  try {
    await renderAsync(file, stage, stage, {
      inWrapper: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      renderComments: false,
      experimental: true,
      useBase64URL: true,
    });
    // Word marks where its own pages ended; a file saved without those marks comes out as
    // one long section, which is cut into page-sized pieces here.
    const pages: { section: HTMLElement; top: number; height: number }[] = [];
    for (const section of stage.querySelectorAll<HTMLElement>("section.docx")) {
      const pageHeight = parseFloat(getComputedStyle(section).minHeight) || Math.round(section.offsetWidth * 1.414);
      // A last piece of only a few lines isn't worth its own preview.
      for (let top = 0; (top === 0 || section.offsetHeight - top > pageHeight * 0.1) && pages.length < from + max; top += pageHeight) {
        pages.push({ section, top, height: Math.min(pageHeight, section.offsetHeight - top) });
      }
    }
    const total = pages.length;
    const first = Math.min(from, Math.max(total - 1, 0));
    const count = Math.min(max, total - first);
    // Each section is photographed once, down to the last piece needed, then cut up.
    const shots = new Map<HTMLElement, { canvas: HTMLCanvasElement; scale: number }>();
    for (let i = 0; i < count; i++) {
      onProgress?.(i, count);
      const { section, top, height } = pages[first + i];
      let shot = shots.get(section);
      if (!shot) {
        const width = section.offsetWidth;
        const last = pages.filter((p) => p.section === section).at(-1)!;
        const shotHeight = last.top + last.height;
        const scale = SLIDE_IMAGE_WIDTH / width;
        const canvas = await toCanvas(section, {
          width,
          height: shotHeight,
          canvasWidth: SLIDE_IMAGE_WIDTH,
          canvasHeight: Math.round(shotHeight * scale),
          pixelRatio: 1,
          skipFonts: true,
          backgroundColor: "#ffffff",
          style: { overflow: "hidden", margin: "0" },
        });
        shot = { canvas, scale };
        shots.set(section, shot);
      }
      const piece = document.createElement("canvas");
      piece.width = SLIDE_IMAGE_WIDTH;
      piece.height = Math.round(height * shot.scale);
      piece.getContext("2d")?.drawImage(shot.canvas, 0, Math.round(top * shot.scale), piece.width, piece.height, 0, 0, piece.width, piece.height);
      await done(piece, first + i, images);
    }
    onProgress?.(count, count);
    return { total, images };
  } finally {
    stage.remove();
  }
}

/** An image resource becomes one smaller preview with a mark across it, so the preview can't stand in for the file. */
async function renderPicture(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { total: 1, images: [] };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.atan2(canvas.height, canvas.width));
    ctx.font = `700 ${Math.round(Math.hypot(canvas.width, canvas.height) / 14)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.strokeStyle = "rgba(30,41,59,0.35)";
    ctx.lineWidth = 2;
    ctx.fillText("GuroMart Preview", 0, 0);
    ctx.strokeText("GuroMart Preview", 0, 0);
    ctx.restore();
    const images: SlideImage[] = [];
    await done(canvas, 0, images);
    return { total: 1, images };
  } finally {
    bitmap.close();
  }
}
