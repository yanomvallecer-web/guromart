import { describe, expect, it } from "vitest";
import { formatBytes, formatPrice, slugify } from "./format";

describe("formatPrice", () => {
  it("formats centavos as pesos", () => {
    expect(formatPrice(15000)).toBe("₱150.00");
    expect(formatPrice(3050)).toBe("₱30.50");
    expect(formatPrice(123456789)).toBe("₱1,234,567.89");
  });
  it("shows free items as Free", () => {
    expect(formatPrice(0)).toBe("Free");
  });
  it("rejects fractional or negative amounts", () => {
    expect(() => formatPrice(-1)).toThrow();
    expect(() => formatPrice(10.5)).toThrow();
  });
});

describe("slugify", () => {
  it("makes URL-safe shop addresses", () => {
    expect(slugify("Ma'am Liza's Printables!")).toBe("maam-lizas-printables");
    expect(slugify("  Gurong Pinoy — Grade 4  ")).toBe("gurong-pinoy-grade-4");
    expect(slugify("Niño Señor")).toBe("nino-senor");
  });
  it("trims to the length limit without a trailing dash", () => {
    expect(slugify("a".repeat(49) + " b c", 50)).toBe("a".repeat(49));
  });
});

describe("formatBytes", () => {
  it("uses KB below a megabyte and never shows 0 KB", () => {
    expect(formatBytes(10)).toBe("1 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
  });
});
