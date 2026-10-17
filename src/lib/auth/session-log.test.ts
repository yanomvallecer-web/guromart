import { describe, expect, it } from "vitest";
import { clientKind, describeLoss, isAuthCookie } from "./session-log";

const none = new URLSearchParams();
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("clientKind", () => {
  it("tells the Android app from phone browsers", () => {
    expect(clientKind(ANDROID, null, new URLSearchParams("app=android"))).toBe("android-app");
    expect(clientKind(ANDROID, "android-app://app.vercel.guromart.twa/", none)).toBe("android-app");
    expect(clientKind(ANDROID, "https://www.google.com/", none)).toBe("android-browser");
    expect(clientKind(IPHONE, null, none)).toBe("iphone");
    expect(clientKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", null, none)).toBe("desktop");
  });
});

describe("describeLoss", () => {
  it("says whether the cookie vanished or was rejected, with no personal details", () => {
    const base = { userAgent: IPHONE, referer: null, search: none, displayMode: "standalone", path: "/library" };
    expect(describeLoss({ ...base, hadAuthCookie: false, errorCode: null })).toEqual({
      event: "session.lost", reason: "cookie_missing", client: "iphone", standalone: true, path: "/library",
    });
    expect(describeLoss({ ...base, hadAuthCookie: true, errorCode: "refresh_token_already_used" }).reason).toBe("refresh_token_already_used");
  });
});

describe("isAuthCookie", () => {
  it("matches the session cookie and its parts only", () => {
    expect(isAuthCookie("sb-abc-auth-token")).toBe(true);
    expect(isAuthCookie("sb-abc-auth-token.1")).toBe(true);
    expect(isAuthCookie("sb-abc-auth-token-code-verifier")).toBe(false);
  });
});
