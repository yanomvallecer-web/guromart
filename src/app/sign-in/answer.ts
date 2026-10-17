import type { SignInState } from "./actions";

/** A sign-in answer kept for a page reload when a form was posted before JavaScript loaded. */
export type PlainPostAnswer = { email: SignInState; code?: SignInState };
export const ANSWER_COOKIE = "gm_signin_answer";

/** Reads the cookie back, accepting only the shapes the actions write. */
export function parseAnswer(raw: string | undefined): PlainPostAnswer | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as PlainPostAnswer;
    const ok = (s: unknown): s is SignInState =>
      typeof s === "object" && s !== null && ["email", "code"].includes((s as SignInState).step) && typeof ((s as SignInState).email ?? "") === "string";
    if (!ok(value.email) || (value.code !== undefined && !ok(value.code))) return undefined;
    return { email: value.email, code: value.code };
  } catch {
    return undefined;
  }
}
