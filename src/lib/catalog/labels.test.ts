import { describe, expect, it } from "vitest";
import { displayTitle, fileFacts, gradeSummary, lengthLabel, shortGradeLabel, shortTypeLabel, typeName } from "./labels";

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

describe("gradeSummary", () => {
  it("groups consecutive grades and keeps other names", () => {
    expect(gradeSummary([])).toBeNull();
    expect(gradeSummary(["Grade 7"])).toBe("Grade 7");
    expect(gradeSummary(["Grade 7", "Grade 8"])).toBe("Grades 7–8");
    expect(gradeSummary(["Grade 4", "Grade 6"])).toBe("Grades 4, 6");
    expect(gradeSummary(["Kindergarten", "Grade 1"])).toBe("Kindergarten, Grade 1");
  });
});

describe("lengthLabel and fileFacts", () => {
  it("counts slides for presentations and pages for the rest", () => {
    expect(lengthLabel(12, "presentation", ["pptx"])).toBe("12 slides");
    expect(lengthLabel(12, "lesson-plan", ["pptx"])).toBe("12 slides");
    expect(lengthLabel(7, "lesson-plan", ["docx"])).toBe("7 pages");
    expect(lengthLabel(1, "worksheet", ["pdf", "pptx"])).toBe("1 page");
    expect(lengthLabel(null, "worksheet", ["pdf"])).toBeNull();
  });
  it("lists only what the listing says", () => {
    expect(fileFacts({ file_formats: ["docx"], page_count: 7, is_editable: true, category_code: "lesson-plan" })).toEqual(["DOCX", "7 pages", "Editable"]);
    expect(fileFacts({ file_formats: ["pdf"], page_count: null, is_editable: false, category_code: "worksheet" })).toEqual(["PDF"]);
    expect(fileFacts({ file_formats: [], page_count: null, is_editable: true, category_code: null })).toEqual([]);
  });
});

describe("displayTitle and typeName", () => {
  it("leads with the topic when there is one", () => {
    expect(displayTitle({ topic: "Heat vs. Temperature", title: "Grade 7 Science Lesson Plan" })).toBe("Heat vs. Temperature");
    expect(displayTitle({ topic: "  ", title: "Grade 7 Science Lesson Plan" })).toBe("Grade 7 Science Lesson Plan");
    expect(typeName("lesson-plan", "Detailed Lesson Plans")).toBe("Lesson Plan");
    expect(typeName("new-type", "New Types")).toBe("New Types");
  });
});
