/**
 * Short names teachers use for resource types, shown on thumbnails where the
 * full category name ("Daily Lesson Logs") would not fit. Unknown or new
 * categories fall back to their full name.
 */
const SHORT_TYPE: Record<string, string> = {
  "daily-lesson-log": "DLL",
  "lesson-plan": "DLP",
  worksheet: "Worksheet",
  "activity-sheet": "Activity sheet",
  presentation: "PPT",
  assessment: "Assessment",
  "learning-module": "Module",
  "teaching-guide": "Guide",
  flashcards: "Flashcards",
  printable: "Printable",
  "educational-game": "Game",
  rubric: "Rubric",
  "classroom-decor": "Decor",
  planner: "Planner",
  intervention: "Intervention",
};

export function shortTypeLabel(code: string | null, name: string | null): string | null {
  return (code && SHORT_TYPE[code]) || name;
}

/** "Grade 4" -> "4" for compact grade chips; other names are kept. */
export function shortGradeLabel(name: string): string {
  return name.replace(/^Grade (\d+)$/, "$1");
}

/** One resource of each type, in the words used on cards and the resource page. */
const TYPE_NAME: Record<string, string> = {
  "daily-lesson-log": "DLL",
  "lesson-plan": "Lesson Plan",
  worksheet: "Worksheet",
  "activity-sheet": "Activity Sheet",
  presentation: "Presentation",
  assessment: "Assessment",
  "learning-module": "Module",
  "teaching-guide": "Teaching Guide",
  flashcards: "Flashcards",
  printable: "Printable",
  "educational-game": "Game",
  rubric: "Rubric",
  "classroom-decor": "Classroom Decor",
  planner: "Planner",
  intervention: "Intervention Material",
};

export function typeName(code: string | null, name: string | null): string | null {
  return (code && TYPE_NAME[code]) || name;
}

/**
 * The grades a resource is for, compactly: "Grade 7", "Grades 7–8",
 * "Grades 4, 6", or the names as given ("Kindergarten, Grade 1").
 */
export function gradeSummary(grades: string[]): string | null {
  if (!grades.length) return null;
  if (grades.length === 1) return grades[0];
  const nums = grades.map((g) => /^Grade (\d+)$/.exec(g)?.[1]).map(Number);
  if (nums.some((n) => !n)) return grades.join(", ");
  const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return consecutive ? `Grades ${nums[0]}–${nums[nums.length - 1]}` : `Grades ${nums.join(", ")}`;
}

/** Slides for slide decks, pages for everything else. */
export function lengthUnit(categoryCode: string | null, formats: string[]): "slide" | "page" {
  if (categoryCode === "presentation") return "slide";
  return formats.length > 0 && formats.every((f) => f === "pptx") ? "slide" : "page";
}

const n = new Intl.NumberFormat("en-PH");

/** "7 pages", "1 slide", or null when the seller didn't say. */
export function lengthLabel(count: number | null, categoryCode: string | null, formats: string[]): string | null {
  if (!count) return null;
  const unit = lengthUnit(categoryCode, formats);
  return `${n.format(count)} ${unit}${count === 1 ? "" : "s"}`;
}

/** File facts for a card: "DOCX · 7 pages · Editable". Only what the listing says. */
export function fileFacts(p: { file_formats: string[]; page_count: number | null; is_editable: boolean; category_code: string | null }): string[] {
  const facts: string[] = [];
  if (p.file_formats.length) facts.push(p.file_formats.map((f) => f.toUpperCase()).join(", "));
  const length = lengthLabel(p.page_count, p.category_code, p.file_formats);
  if (length) facts.push(length);
  if (p.is_editable && p.file_formats.length) facts.push("Editable");
  return facts;
}

/** The lesson topic leads when the seller gave one; otherwise the listing title. */
export function displayTitle(p: { topic: string | null; title: string }): string {
  return p.topic?.trim() || p.title;
}

/** "3 resources · Science, English · Grades 7–8", from what a shop has live. */
export function shopSummary(shop: { count: number; subjects: string[]; grades: string[] }): string {
  return [`${n.format(shop.count)} ${shop.count === 1 ? "resource" : "resources"}`, shop.subjects.join(", "), gradeSummary(shop.grades)]
    .filter(Boolean)
    .join(" · ");
}
