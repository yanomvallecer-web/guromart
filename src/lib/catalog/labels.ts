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
