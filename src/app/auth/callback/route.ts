import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

// OAuth (PKCE) return URL.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("Sign-in link failed", { status: error.status, code: error.code, message: error.message });
  } else {
    console.error("Sign-in link failed", {
      code: searchParams.get("error_code") ?? searchParams.get("error"),
      reason: searchParams.get("error_description") ?? "no code in link",
    });
  }
  return NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, origin));
}
