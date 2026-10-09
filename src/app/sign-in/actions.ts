"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, otpSchema } from "@/lib/validation/auth";

export type SignInState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string };

export async function sendCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    console.error("Sign-in email failed", { status: error.status, code: error.code, message: error.message });
    // Supabase limits both per-address requests (about a minute apart) and
    // emails sent by the whole project per hour.
    const message =
      error.code === "over_email_send_rate_limit"
        ? "GuroMart has sent too many sign-in emails for now. Please try again within the hour."
        : error.status === 429
          ? "Too many sign-in emails requested. Wait a minute, then try again."
          : "We couldn't send a sign-in email right now. Please try again.";
    return { step: "email", email: parsed.data.email, error: message };
  }
  return { step: "code", email: parsed.data.email };
}

export async function verifyCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = otpSchema.safeParse({ email: formData.get("email"), token: formData.get("token") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { step: "code", email, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { step: "code", email, error: "That code is wrong or has expired. Check the latest email or send a new code." };
  redirect(safeNextPath(formData.get("next")));
}

export async function signInWithGoogle(formData: FormData) {
  if (!publicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED) redirect("/sign-in");
  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/sign-in?error=oauth&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
