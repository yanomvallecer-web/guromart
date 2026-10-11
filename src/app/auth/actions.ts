"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIGNED_IN_MARKER } from "@/lib/auth/session-log";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Signing out on purpose isn't a lost session.
  (await cookies()).delete(SIGNED_IN_MARKER);
  redirect("/");
}
