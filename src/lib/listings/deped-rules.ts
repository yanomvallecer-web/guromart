/**
 * What may and may not be sold, based on DepEd's public warnings: its own
 * learning materials are free and can't be resold (RA 8293 Sec. 176 needs
 * DepEd's approval to profit from government works), and school staff may not
 * sell materials to their own learners. Shown to sellers and reviewers.
 */
export const NOT_ALLOWED = [
  "DepEd's own materials: self-learning modules (SLMs), ADM modules, learner's materials, textbooks, teacher's guides and curriculum guides, including MATATAG. Retyping or reformatting them doesn't make them yours.",
  "Blank DepEd forms and formats, such as an empty DLL or DLP template, for a price. You can list them for free.",
  "Anything copied from other teachers, publishers or websites without written permission.",
  "Asking your own learners or their parents to buy from your shop.",
] as const;

export const ALLOWED =
  "Lesson plans, DLLs, worksheets, slides and activities you wrote yourself, even when they follow DepEd's format, MELCs and competencies.";

export type DepedFlagInput = {
  title: string;
  summary?: string | null;
  topic?: string | null;
  description: string;
  price_centavos: number;
};

const DEPED_MATERIAL =
  /\b(self[- ]?learning modules?|SLMs?|ADM modules?|alternative delivery mode|learner'?s? materials?|teacher'?s guides?|curriculum guides?|deped textbooks?|deped commons|LRMDS)\b/i;
const LESSON_FORMAT = /\b(DLLs?|DLPs?|daily lesson logs?|detailed lesson plans?)\b/i;
const BLANK = /\b(blank|template|empty format)\b/i;

/**
 * Words in a listing that suggest it breaks a DepEd rule above. These are
 * hints for the seller and the reviewer, not proof, so they never block a listing.
 */
export function depedFlags(l: DepedFlagInput): string[] {
  const text = [l.title, l.summary, l.topic, l.description].filter(Boolean).join("\n");
  const flags: string[] = [];
  const material = text.match(DEPED_MATERIAL);
  if (material) {
    flags.push(`Mentions "${material[0]}". DepEd's own modules, textbooks and guides can't be sold here, only material you wrote yourself.`);
  }
  if (l.price_centavos > 0 && LESSON_FORMAT.test(text) && BLANK.test(text)) {
    flags.push("Looks like a blank DLL or DLP template with a price. Blank DepEd formats can only be listed for free.");
  }
  return flags;
}
