import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Area, type Role, canAccess, isRole } from "./roles";

export type Viewer = {
  id: string;
  email: string | null;
  displayName: string;
  roles: Role[];
};

/**
 * The signed-in user for this request, or null. Identity comes from the
 * verified JWT (getClaims), never from client input. Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const [profile, roles] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  return {
    id: userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    displayName: profile.data?.display_name || (typeof data.claims.email === "string" ? data.claims.email.split("@")[0] : "Teacher"),
    roles: (roles.data ?? []).map((r) => r.role).filter(isRole),
  };
});

/** Redirects to sign-in when nobody is signed in. */
export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return viewer;
}

/** Server-side gate for an area; renders the 403 page when the roles do not allow it. */
export async function requireArea(area: Area, nextPath: string): Promise<Viewer> {
  const viewer = await requireViewer(nextPath);
  if (!canAccess(viewer.roles, area)) forbidden();
  return viewer;
}
