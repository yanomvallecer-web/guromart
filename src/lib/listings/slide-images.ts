/**
 * Turns the first slides of a .pptx into JPEG preview images, in the seller's
 * browser. Nothing is uploaded here; the caller shows the pictures and uploads
 * the ones the seller keeps through the normal preview upload.
 */

export const SLIDE_IMAGE_WIDTH = 1280;
const WATERMARK = "Preview · GuroMart";

export type SlideImage = { index: number; blob: Blob; url: string };

export async function renderSlideImages(file: File, max: number, onProgress?: (done: number, total: number) => void): Promise<{ total: number; images: SlideImage[] }> {
  const [{ parseZip, buildPresentation, renderSlide, RECOMMENDED_ZIP_LIMITS }, { toCanvas }] = await Promise.all([
    import("@aiden0z/pptx-renderer"),
    import("html-to-image"),
  ]);
  const presentation = buildPresentation(await parseZip(await file.arrayBuffer(), RECOMMENDED_ZIP_LIMITS));
  const total = presentation.slides.length;
  const count = Math.min(max, total);

  // The slide is drawn at its own size off screen, then photographed.
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  Object.assign(stage.style, { position: "fixed", left: "-100000px", top: "0", width: `${presentation.width}px`, height: `${presentation.height}px`, overflow: "hidden" });
  document.body.appendChild(stage);

  const images: SlideImage[] = [];
  try {
    for (let i = 0; i < count; i++) {
      onProgress?.(i, count);
      const handle = renderSlide(presentation, presentation.slides[i], { pdfjs: false });
      try {
        stage.replaceChildren(handle.element);
        await handle.ready;
        const scale = SLIDE_IMAGE_WIDTH / presentation.width;
        // No backgroundColor option: html-to-image would paint it over the slide's own background.
        const drawn = await toCanvas(handle.element, {
          width: presentation.width,
          height: presentation.height,
          canvasWidth: SLIDE_IMAGE_WIDTH,
          canvasHeight: Math.round(presentation.height * scale),
          pixelRatio: 1,
          skipFonts: true,
        });
        const shot = onWhite(drawn);
        watermark(shot);
        const blob = await new Promise<Blob | null>((resolve) => shot.toBlob(resolve, "image/jpeg", 0.85));
        if (blob) images.push({ index: i, blob, url: URL.createObjectURL(blob) });
      } finally {
        handle.dispose();
      }
    }
  } finally {
    stage.remove();
  }
  onProgress?.(count, count);
  return { total, images };
}

/** JPEG has no transparency, so slides without a background sit on white instead of black. */
function onWhite(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function watermark(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = Math.round(canvas.width / 48);
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const pad = Math.round(size * 0.6);
  const w = ctx.measureText(WATERMARK).width + pad * 2;
  const h = size + pad;
  const x = canvas.width - w - pad;
  const y = canvas.height - h - pad;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(30,41,59,0.9)";
  ctx.textBaseline = "middle";
  ctx.fillText(WATERMARK, x + pad, y + h / 2);
}
