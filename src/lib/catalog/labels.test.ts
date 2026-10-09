import { describe, expect, it } from "vitest";
import { shortGradeLabel, shortTypeLabel } from "./labels";

describe("shortTypeLabel", () => {
  it("uses the names teachers use, and falls back to the category name", () => {
    expect(shortTypeLabel("daily-lesson-log", "Daily Lesson Logs")).toBe("DLL");
    expect(shortTypeLabel("presentation", "PowerPoint Presentations")).toBe("PPT");
    expect(shortTypeLabel("something-new", "Something New")).toBe("Something New");
    expect(shortTypeLabel(null, null)).toBeNull();
  });
});

describe("shortGradeLabel", () => {
  it("shortens numbered grades only", () => {
    expect(shortGradeLabel("Grade 4")).toBe("4");
    expect(shortGradeLabel("Grade 12")).toBe("12");
    expect(shortGradeLabel("Kindergarten")).toBe("Kindergarten");
  });
});
