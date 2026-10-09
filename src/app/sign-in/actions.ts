"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/roles";
import { parseSocialProvider } from "@/lib/auth/social";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, otpSchema } from "@/lib/validation/auth";
import { ANSWER_COOKIE, type PlainPostAnswer } from "./answer";

export type SignInState =
  | { step: "email"; error?: string; email?: string }
  // `resent` and `resendError` answer the "Send a new code" button on the code step.
  | { step: "code"; email: string; error?: string; resent?: boolean; resendError?: string };

/**
 * Before the page's JavaScript has loaded (slow mobile data), a form posts the
 * old-fashioned way and React can't show the action's answer. Those posts
 * carry no Next-Action header; for them the answer is kept for a few minutes
 * in a private cookie and the page reloads to show it (see page.tsx).
 */
async function answerPlainPost(next: string, answer: PlainPostAnswer) {
  if ((await headers()).has("next-action")) return;
  (await cookies()).set(ANSWER_COOKIE, JSON.stringify(answer), { httpOnly: true, sameSite: "lax", path: "/sign-in", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  redirect(`/sign-in?next=${encodeURIComponent(next)}&sent=1`);
}

export async function sendCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  const state = await sendCodeState(prev, formData);
  await answerPlainPost(safeNextPath(formData.get("next")), { email: state });
  return state;
}

export async function verifyCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  const state = await verifyCodeState(prev, formData);
  // Only failures get here; a correct code redirects inside verifyCodeState.
  await answerPlainPost(safeNextPath(formData.get("next")), { email: { step: "code", email: state.email ?? "" }, code: state });
  return state;
}

async function sendCodeState(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };

  const next = safeNextPath(formData.get("next"));
  const resend = formData.get("resend") === "1";
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
    // A failed resend keeps the teacher on the code step: the earlier code may still work.
    if (resend) return { step: "code", email: parsed.data.email, resendError: message };
    return { step: "email", email: parsed.data.email, error: message };
  }
  return { step: "code", email: parsed.data.email, resent: resend };
}

async function verifyCodeState(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = otpSchema.safeParse({ email: formData.get("email"), token: formData.get("token") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { step: "code", email, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { step: "code", email, error: "That code is wrong or has expired. Check the latest email or send a new code." };
  (await cookies()).delete({ name: ANSWER_COOKIE, path: "/sign-in" });
  redirect(safeNextPath(formData.get("next")));
}

export async function signInWithSocial(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const provider = parseSocialProvider(formData.get("provider"), publicEnv());
  if (!provider) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.id,
    options: { redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    console.error("Social sign-in failed to start", { provider: provider.id, message: error?.message });
    redirect(`/sign-in?error=oauth&next=${encodeURIComponent(next)}`);
  }
  redirect(data.url);
}
