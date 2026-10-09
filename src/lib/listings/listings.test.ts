import { describe, expect, it } from "vitest";
import { listingFromForm, pesosToCentavos, reviewProblems } from "./schema";
import { checkUpload, cleanFileName, matchesSignature, objectPath } from "./uploads";

describe("pesosToCentavos", () => {
  it("parses peso amounts", () => {
    expect(pesosToCentavos("150")).toBe(15000);
    expect(pesosToCentavos("99.5")).toBe(9950);
    expect(pesosToCentavos("₱1,200.00")).toBe(120000);
    expect(pesosToCentavos("")).toBe(0);
  });
  it("rejects bad amounts", () => {
    expect(pesosToCentavos("-5")).toBeNull();
    expect(pesosToCentavos("1.234")).toBeNull();
    expect(pesosToCentavos("abc")).toBeNull();
  });
});

function form(fields: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

describe("listingFromForm", () => {
  const base = { title: "Fractions worksheet", category: "worksheet", price: "150", license_type: "single_teacher" };
  it("accepts a minimal draft", () => {
    const r = listingFromForm(form(base));
    expect(r.success).toBe(true);
    expect(r.data?.price).toBe(15000);
    expect(r.data?.subject).toBeNull();
  });
  it("collects several grades", () => {
    expect(listingFromForm(form({ ...base, grades: ["grade-4", "grade-5"] })).data?.grades).toEqual(["grade-4", "grade-5"]);
  });
  it("enforces the PHP 30 minimum but allows free", () => {
    expect(listingFromForm(form({ ...base, price: "20" })).success).toBe(false);
    expect(listingFromForm(form({ ...base, price: "0" })).data?.price).toBe(0);
  });
  it("rejects hostile codes", () => {
    expect(listingFromForm(form({ ...base, category: "x'; drop" })).success).toBe(false);
  });
});

describe("reviewProblems", () => {
  const ready = { title: "Fractions", description: "x".repeat(60), category_id: 1, subject_id: 2, grade_count: 1, file_count: 1, preview_count: 1, copyright_declared: true };
  it("is empty when everything is there", () => {
    expect(reviewProblems(ready)).toEqual([]);
  });
  it("lists what is missing", () => {
    expect(reviewProblems({ ...ready, file_count: 0, copyright_declared: false })).toEqual([
      "Upload at least one file.",
      "Confirm you own the rights to sell this resource.",
    ]);
  });
});

describe("checkUpload", () => {
  it("accepts teaching file types", () => {
    expect(checkUpload("file", "Lesson Plan Q2.DOCX", 1000)).toEqual({ ok: true, value: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", format: "docx" } });
    expect(checkUpload("file", "photo.jpeg", 10).ok).toBe(true);
  });
  it("rejects executables, oversize files and non-image previews", () => {
    expect(checkUpload("file", "setup.exe", 10).ok).toBe(false);
    expect(checkUpload("file", "worksheet.pdf.exe", 10).ok).toBe(false);
    expect(checkUpload("file", "big.pdf", 101 * 1024 * 1024).ok).toBe(false);
    expect(checkUpload("preview", "slides.pdf", 10).ok).toBe(false);
    expect(checkUpload("preview", "cover.png", 6 * 1024 * 1024).ok).toBe(false);
  });
});

describe("checkUpload for identity documents", () => {
  it("accepts PDFs and photos up to 10 MB only", () => {
    expect(checkUpload("verification", "id.pdf", 1000).ok).toBe(true);
    expect(checkUpload("verification", "id.JPG", 1000).ok).toBe(true);
    expect(checkUpload("verification", "id.docx", 1000)).toEqual({ ok: false, error: "Upload a PDF or a PNG, JPG or WebP photo." });
    expect(checkUpload("verification", "id.pdf", 10 * 1024 * 1024 + 1).ok).toBe(false);
  });
});

describe("checkUpload for shop images", () => {
  it("accepts images up to 5 MB only", () => {
    expect(checkUpload("shop", "logo.webp", 1000).ok).toBe(true);
    expect(checkUpload("shop", "logo.pdf", 1000)).toEqual({ ok: false, error: "Shop images must be PNG, JPG or WebP." });
    expect(checkUpload("shop", "banner.png", 5 * 1024 * 1024 + 1).ok).toBe(false);
  });
});

describe("matchesSignature", () => {
  const bytes = (s: number[]) => new Uint8Array([...s, ...new Array(16).fill(0)]);
  it("recognizes real files", () => {
    expect(matchesSignature("pdf", bytes([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(matchesSignature("docx", bytes([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(matchesSignature("png", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });
  it("catches renamed files", () => {
    expect(matchesSignature("pdf", bytes([0x4d, 0x5a]))).toBe(false); // a Windows executable
    expect(matchesSignature("png", bytes([0x25, 0x50, 0x44, 0x46]))).toBe(false);
    expect(matchesSignature("pdf", new Uint8Array([0x25]))).toBe(false);
  });
});

describe("file names and paths", () => {
  it("cleans names", () => {
    expect(cleanFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(cleanFileName("  Q2  Science\tDLL.pdf ")).toBe("Q2 Science DLL.pdf");
  });
  it("builds owner-scoped paths", () => {
    expect(objectPath("s1", "p1", "pdf", "abc")).toBe("s1/p1/abc.pdf");
  });
});
