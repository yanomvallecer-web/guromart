import { describe, expect, it } from "vitest";
import { browseHref, effectiveSort, parseBrowseParams, priceRange } from "./search-params";

describe("parseBrowseParams", () => {
  it("keeps valid filters", () => {
    expect(parseBrowseParams({ q: " fractions ", grade: "grade-4", price: "free", page: "2", sort: "rating" })).toEqual({
      q: "fractions",
      grade: "grade-4",
      price: "free",
      page: 2,
      sort: "rating",
    });
  });
  it("drops invalid or hostile values instead of failing", () => {
    const p = parseBrowseParams({ grade: "'; drop table--", price: "cheap", page: "-3", sort: "random", format: "exe", q: "" });
    expect(p.grade).toBeUndefined();
    expect(p.price).toBeUndefined();
    expect(p.page).toBeUndefined();
    expect(p.sort).toBeUndefined();
    expect(p.format).toBeUndefined();
    expect(p.q).toBeUndefined();
  });
  it("uses the first value when a key repeats", () => {
    expect(parseBrowseParams({ subject: ["science", "math"] }).subject).toBe("science");
  });
  it("caps very long searches", () => {
    expect(parseBrowseParams({ q: "x".repeat(500) }).q).toBeUndefined();
  });
});

describe("priceRange", () => {
  it("maps bands to centavo ranges", () => {
    expect(priceRange("free")).toEqual([0, 0]);
    expect(priceRange("under-100")).toEqual([1, 9999]);
    expect(priceRange("100-200")).toEqual([10000, 20000]);
    expect(priceRange("over-200")).toEqual([20001, null]);
    expect(priceRange(undefined)).toBeNull();
  });
});

describe("effectiveSort", () => {
  it("defaults to relevance for searches and newest otherwise", () => {
    expect(effectiveSort({ q: "dll" })).toBe("relevance");
    expect(effectiveSort({})).toBe("newest");
    expect(effectiveSort({ sort: "relevance" })).toBe("newest");
  });
});

describe("browseHref", () => {
  it("keeps filters, applies changes and resets the page", () => {
    expect(browseHref({ q: "math", grade: "grade-1", page: 3 }, { subject: "science" })).toBe("/browse?q=math&grade=grade-1&subject=science");
    expect(browseHref({ grade: "grade-1" }, { grade: null })).toBe("/browse");
    expect(browseHref({ grade: "grade-1" }, { page: 2 })).toBe("/browse?grade=grade-1&page=2");
  });
});
