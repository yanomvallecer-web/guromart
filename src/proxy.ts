import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Paths that need a signed-in user. This is a fast redirect only; every
// protected page and action checks the session and roles again on the server.
const PROTECTED_PREFIXES = ["/account", "/seller", "/admin", "/sell/start", "/cart", "/library", "/orders"];

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

  // Refreshes an expired access token and writes the new cookies.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

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
    return NextResponse.redirect(callback);
  }
  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
