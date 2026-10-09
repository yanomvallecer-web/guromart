import { describe, expect, it } from "vitest";
import type { PublicEnv } from "@/lib/env";
import { enabledSocialProviders, parseSocialProvider } from "./social";

const env = (google: boolean, facebook: boolean): PublicEnv => ({
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_value",
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: google,
  NEXT_PUBLIC_AUTH_FACEBOOK_ENABLED: facebook,
});

describe("social sign-in providers", () => {
  it("lists only the providers switched on", () => {
    expect(enabledSocialProviders(env(false, false))).toEqual([]);
    expect(enabledSocialProviders(env(true, false)).map((p) => p.id)).toEqual(["google"]);
    expect(enabledSocialProviders(env(true, true)).map((p) => p.id)).toEqual(["facebook", "google"]);
  });

  it("refuses providers that are off or unknown", () => {
    expect(parseSocialProvider("facebook", env(true, false))).toBeNull();
    expect(parseSocialProvider("github", env(true, true))).toBeNull();
    expect(parseSocialProvider(null, env(true, true))).toBeNull();
    expect(parseSocialProvider("facebook", env(false, true))?.id).toBe("facebook");
  });
});
