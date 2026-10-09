import { describe, expect, it } from "vitest";
import { emailSchema, otpSchema } from "./auth";
import { profileSchema } from "./profile";
import { shopProfileSchema, startSellingSchema } from "./seller";

describe("auth validation", () => {
  it("normalizes email", () => {
    expect(emailSchema.parse({ email: "  Teacher@DepEd.gov.ph " }).email).toBe("teacher@deped.gov.ph");
  });
  it("rejects bad emails and codes", () => {
    expect(emailSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(otpSchema.safeParse({ email: "a@b.ph", token: "12ab56" }).success).toBe(false);
    expect(otpSchema.safeParse({ email: "a@b.ph", token: "123456" }).success).toBe(true);
  });
});

describe("profile validation", () => {
  it("turns empty optional fields into null", () => {
    expect(profileSchema.parse({ display_name: "Liza", school_name: " ", region: "" })).toEqual({ display_name: "Liza", school_name: null, region: null });
  });
  it("requires a real name", () => {
    expect(profileSchema.safeParse({ display_name: "L", school_name: "", region: "" }).success).toBe(false);
  });
});

describe("start selling validation", () => {
  const valid = { seller_type: "teacher", store_name: "Liza Prints", store_slug: "liza-prints", agree: "on" };
  it("accepts a valid shop", () => {
    expect(startSellingSchema.safeParse(valid).success).toBe(true);
  });
  it("requires consent, a known seller type and a clean address", () => {
    expect(startSellingSchema.safeParse({ ...valid, agree: undefined }).success).toBe(false);
    expect(startSellingSchema.safeParse({ ...valid, seller_type: "admin" }).success).toBe(false);
    expect(startSellingSchema.safeParse({ ...valid, store_slug: "-bad-" }).success).toBe(false);
    expect(startSellingSchema.safeParse({ ...valid, store_slug: "Has Spaces" }).success).toBe(false);
  });
});

describe("shopProfileSchema", () => {
  it("trims text and turns blanks into nothing", () => {
    const r = shopProfileSchema.safeParse({ name: "  Liza Prints ", tagline: " ", description: "Science sheets", is_published: true });
    expect(r.success && r.data).toEqual({ name: "Liza Prints", tagline: null, description: "Science sheets", is_published: true });
  });

  it("limits lengths", () => {
    expect(shopProfileSchema.safeParse({ name: "L", tagline: "", description: "", is_published: true }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ name: "Liza", tagline: "x".repeat(141), description: "", is_published: true }).success).toBe(false);
  });
});
