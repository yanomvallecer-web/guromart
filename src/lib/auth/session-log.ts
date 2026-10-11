/**
 * A record of signed-in people unexpectedly arriving signed out, so we can see
 * where sessions are lost (the Android app, a phone browser, an iPhone home
 * screen icon). It holds no account or personal details: only the kind of
 * device, whether the sign-in cookie was gone or rejected, and the page.
 */

/** Set while someone is signed in; cleared when they sign out on purpose. */
export const SIGNED_IN_MARKER = "gm_signed_in";
export const MARKER_MAX_AGE = 400 * 24 * 60 * 60;

export type ClientKind = "android-app" | "android-browser" | "iphone" | "ipad" | "desktop" | "other";

export function clientKind(userAgent: string, referer: string | null, search: URLSearchParams): ClientKind {
  if (search.get("app") === "android" || (referer ?? "").startsWith("android-app://")) return "android-app";
  if (/iPhone|iPod/.test(userAgent)) return "iphone";
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile\//.test(userAgent))) return "ipad";
  if (/Android/.test(userAgent)) return "android-browser";
  if (/Windows|Macintosh|X11|CrOS/.test(userAgent)) return "desktop";
  return "other";
}

export type SessionLoss = {
  event: "session.lost";
  /** cookie_missing: the browser or app no longer sent the sign-in cookie. Otherwise the auth error code. */
  reason: string;
  client: ClientKind;
  /** Whether the browser said it is an installed home-screen app (Chromium only). */
  standalone: boolean;
  path: string;
};

export function describeLoss(input: {
  hadAuthCookie: boolean;
  errorCode: string | null;
  userAgent: string;
  referer: string | null;
  search: URLSearchParams;
  displayMode: string | null;
  path: string;
}): SessionLoss {
  return {
    event: "session.lost",
    reason: input.hadAuthCookie ? (input.errorCode ?? "session_rejected") : "cookie_missing",
    client: clientKind(input.userAgent, input.referer, input.search),
    standalone: input.displayMode === "standalone",
    path: input.path.slice(0, 120),
  };
}

/** Supabase keeps the session in sb-<ref>-auth-token, split into .0, .1… when large. */
export const isAuthCookie = (name: string) => /^sb-.+-auth-token(\.\d+)?$/.test(name);
