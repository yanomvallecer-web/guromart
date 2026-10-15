import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { describeLoss, isAuthCookie, MARKER_MAX_AGE, SIGNED_IN_MARKER } from "@/lib/auth/session-log";

// Paths that need a signed-in user. This is a fast redirect only; every
// protected page and action checks the session and roles again on the server.
const PROTECTED_PREFIXES = ["/home", "/account", "/seller", "/admin", "/sell/start", "/cart", "/library", "/orders", "/notifications", "/messages", "/help"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const hadAuthCookie = request.cookies.getAll().some((c) => isAuthCookie(c.name));
  // Refreshes an expired access token and writes the new cookies.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // Notes when someone who was signed in arrives signed out without signing
  // out, so lost sessions can be traced to a device or cause in the logs.
  const wasSignedIn = request.cookies.has(SIGNED_IN_MARKER);
  // Only full page loads count, not the background requests a page makes as it runs.
  const pageLoad =
    !request.headers.has("rsc") &&
    !request.headers.has("next-router-prefetch") &&
    !request.headers.has("sec-purpose") &&
    request.headers.get("purpose") !== "prefetch" &&
    (request.headers.get("sec-fetch-mode") ?? "navigate") === "navigate";
  const markSession = (res: NextResponse) => {
    if (signedIn && !wasSignedIn) {
      res.cookies.set(SIGNED_IN_MARKER, "1", { path: "/", maxAge: MARKER_MAX_AGE, httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
    } else if (!signedIn && wasSignedIn && pageLoad) {
      console.warn(
        JSON.stringify(
          describeLoss({
            hadAuthCookie,
            errorCode: (error as { code?: string } | null)?.code ?? null,
            userAgent: request.headers.get("user-agent") ?? "",
            referer: request.headers.get("referer"),
            search: request.nextUrl.searchParams,
            displayMode: request.cookies.get("gm_display")?.value ?? null,
            path: request.nextUrl.pathname,
          }),
        ),
      );
      res.cookies.delete(SIGNED_IN_MARKER);
    }
    return res;
  };

  const { pathname, search } = request.nextUrl;
  // Supabase sends a sign-in link or a failed Facebook/Google sign-in back to
  // the Site URL instead of /auth/callback when the callback address isn't on
  // its redirect list. Hand it to the callback so it finishes or is reported.
  const params = request.nextUrl.searchParams;
  if (pathname === "/" && (params.has("code") || params.has("error_description"))) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    callback.search = "";
    for (const key of ["code", "error", "error_code", "error_description"]) {
      const value = params.get(key);
      if (value) callback.searchParams.set(key, value);
    }
    callback.searchParams.set("next", "/");
    return markSession(NextResponse.redirect(callback));
  }
  // Signed-in teachers get their own home at "/"; visitors keep the landing page.
  if (signedIn && pathname === "/") {
    const home = request.nextUrl.clone();
    home.pathname = "/home";
    const rewrite = NextResponse.rewrite(home, { request });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return markSession(rewrite);
  }
  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(pathname + search)}`;
    return markSession(NextResponse.redirect(signIn));
  }
  return markSession(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
