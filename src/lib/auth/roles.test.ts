import { describe, expect, it } from "vitest";
import { canAccess, isRole, safeNextPath } from "./roles";

describe("canAccess", () => {
  it("lets any signed-in user into their account", () => {
    expect(canAccess([], "account")).toBe(true);
  });
  it("keeps buyers out of seller and admin areas", () => {
    expect(canAccess([], "seller")).toBe(false);
    expect(canAccess([], "admin")).toBe(false);
  });
  it("lets sellers into the seller area only", () => {
    expect(canAccess(["seller"], "seller")).toBe(true);
    expect(canAccess(["seller", "publisher"], "admin")).toBe(false);
  });
  it("lets admins in everywhere", () => {
    expect(canAccess(["admin"], "seller")).toBe(true);
    expect(canAccess(["admin"], "admin")).toBe(true);
  });
});

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/seller?tab=products")).toBe("/seller?tab=products");
  });
  it("rejects open redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null, "/account")).toBe("/account");
  });
});
