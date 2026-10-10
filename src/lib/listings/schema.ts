import { z } from "zod";

/** "150", "150.5", "₱1,200.00" -> centavos. Returns null when not a valid amount. */
export function pesosToCentavos(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export const LICENSE_TYPES = [
  { value: "single_teacher", label: "One teacher", hint: "For the buyer's own classes." },
  { value: "multiple_teachers", label: "Several teachers", hint: "Shared with colleagues at the same school." },
  { value: "school_site", label: "Whole school", hint: "Everyone at one school." },
] as const;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

const code = z.string().regex(/^[a-z0-9_-]{1,60}$/);
const optionalCode = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .pipe(code.nullable());

export const MIN_PAID_CENTAVOS = 3000;
export const MAX_PRICE_CENTAVOS = 10_000_00;

/** A listing as the seller edits it. Drafts can be incomplete; see reviewProblems for submission. */
export const listingSchema = z.object({
  title: z.string().trim().min(4, "Use at least 4 characters.").max(160, "Keep the title under 160 characters."),
  summary: optional(300),
  description: z.string().trim().max(10000, "Keep the description under 10,000 characters."),
  category: code,
  subject: optionalCode,
  curriculum: optionalCode,
  period: optionalCode,
  period_detail: optional(80),
  topic: optional(200),
  learning_competency: optional(1000),
  language: optionalCode,
  grades: z.array(code).max(14),
  price: z
    .string()
    .transform((v, ctx) => {
      const c = pesosToCentavos(v);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: "Enter a price in pesos, like 150 or 99.50." });
        return z.NEVER;
      }
      return c;
    })
    .refine((c) => c === 0 || c >= MIN_PAID_CENTAVOS, "Paid resources must cost at least ₱30. Use 0 for free.")
    .refine((c) => c <= MAX_PRICE_CENTAVOS, "The highest price is ₱10,000."),
  page_count: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(z.number().int().min(1).max(5000).nullable()),
  is_editable: z.boolean(),
  license_type: z.enum(["single_teacher", "multiple_teachers", "school_site"]),
  license_terms: optional(4000),
  copyright_declared: z.boolean(),
});

export type ListingInput = z.infer<typeof listingSchema>;

export function listingFromForm(form: FormData) {
  return listingSchema.safeParse({
    title: form.get("title") ?? "",
    summary: form.get("summary") ?? "",
    description: form.get("description") ?? "",
    category: form.get("category") ?? "",
    subject: form.get("subject") ?? "",
    curriculum: form.get("curriculum") ?? "",
    period: form.get("period") ?? "",
    period_detail: form.get("period_detail") ?? "",
    topic: form.get("topic") ?? "",
    learning_competency: form.get("learning_competency") ?? "",
    language: form.get("language") ?? "",
    grades: form.getAll("grades").map(String),
    price: String(form.get("price") ?? ""),
    page_count: String(form.get("page_count") ?? ""),
    is_editable: form.get("is_editable") === "on",
    license_type: form.get("license_type") ?? "single_teacher",
    license_terms: form.get("license_terms") ?? "",
    copyright_declared: form.get("copyright_declared") === "on",
  });
}

/** Preview images a listing needs before review: a cover and at least one inside page. */
export const MIN_PREVIEWS = 2;

export type ReviewCheck = {
  title: string;
  topic: string | null;
  description: string;
  category_id: number | null;
  subject_id: number | null;
  grade_count: number;
  file_count: number;
  preview_count: number;
  copyright_declared: boolean;
};

/** What still blocks a listing from being sent to review, in plain words. Empty means ready. */
export function reviewProblems(c: ReviewCheck): string[] {
  const problems: string[] = [];
  if (c.title.trim().length < 4) problems.push("Add a title.");
  if (!c.topic?.trim()) problems.push("Add the lesson topic, for example \"Heat vs. Temperature\". It's the title teachers see first.");
  if (c.description.trim().length < 50) problems.push("Describe the resource in at least 50 characters.");
  if (!c.category_id) problems.push("Choose a resource type.");
  if (!c.subject_id) problems.push("Choose a subject.");
  if (c.grade_count === 0) problems.push("Choose at least one grade level.");
  if (c.file_count === 0) problems.push("Upload at least one file.");
  if (c.preview_count < MIN_PREVIEWS)
    problems.push(`Add at least ${MIN_PREVIEWS} preview images: the cover and a page from inside, so teachers can see what they get.`);
  if (!c.copyright_declared) problems.push("Confirm you own the rights to sell this resource.");
  return problems;
}

export type CompletenessCheck = ReviewCheck & {
  summary: string | null;
  learning_competency: string | null;
  page_count: number | null;
  curriculum_id: number | null;
  academic_period_id: number | null;
  language_code: string | null;
};

/**
 * Everything that makes a listing easy to judge, required or not, with
 * whether it's done. Required items are the ones reviewProblems checks.
 */
export function completeness(c: CompletenessCheck): { label: string; done: boolean; required: boolean }[] {
  return [
    { label: "Lesson topic", done: Boolean(c.topic?.trim()), required: true },
    { label: "Resource type, subject and grade", done: Boolean(c.category_id && c.subject_id && c.grade_count), required: true },
    { label: "Description of at least 50 characters", done: c.description.trim().length >= 50, required: true },
    { label: "The file teachers download", done: c.file_count > 0, required: true },
    { label: `${MIN_PREVIEWS} or more preview images`, done: c.preview_count >= MIN_PREVIEWS, required: true },
    { label: "Copyright confirmation", done: c.copyright_declared, required: true },
    { label: "Learning competency (MELC or code)", done: Boolean(c.learning_competency?.trim()), required: false },
    { label: "Number of pages or slides", done: Boolean(c.page_count), required: false },
    { label: "Quarter or curriculum", done: Boolean(c.academic_period_id || c.curriculum_id), required: false },
    { label: "Language", done: Boolean(c.language_code), required: false },
    { label: "4 or more previews, including an activity and the assessment", done: c.preview_count >= 4, required: false },
    { label: "Short summary", done: Boolean(c.summary?.trim()), required: false },
  ];
}
