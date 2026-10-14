import { describe, expect, it } from "vitest";
import { firstName, greeting } from "./greeting";

describe("greeting", () => {
  it("follows the clock in the Philippines", () => {
    expect(greeting(new Date("2026-10-14T00:30:00Z"))).toBe("Magandang umaga"); // 8:30 in Manila
    expect(greeting(new Date("2026-10-14T06:00:00Z"))).toBe("Magandang hapon"); // 14:00
    expect(greeting(new Date("2026-10-14T12:00:00Z"))).toBe("Magandang gabi"); // 20:00
  });
});

describe("firstName", () => {
  it("uses the first word of the name", () => {
    expect(firstName("Ana Santos")).toBe("Ana");
    expect(firstName("  ana ")).toBe("ana");
    expect(firstName("")).toBe("Teacher");
  });
});
