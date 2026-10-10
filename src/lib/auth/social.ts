import type { PublicEnv } from "@/lib/env";

export const SOCIAL_PROVIDERS = [
  { id: "facebook", label: "Continue with Facebook", flag: "NEXT_PUBLIC_AUTH_FACEBOOK_ENABLED" },
  { id: "google", label: "Continue with Google", flag: "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED" },
] as const satisfies readonly { id: string; label: string; flag: keyof PublicEnv }[];

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** Providers switched on in this deployment, in the order the sign-in page shows them. */
export function enabledSocialProviders(env: PublicEnv): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((p) => env[p.flag] === true);
}

/** The enabled provider named by untrusted form input, or null. */
export function parseSocialProvider(value: unknown, env: PublicEnv): SocialProvider | null {
  return enabledSocialProviders(env).find((p) => p.id === value) ?? null;
}
