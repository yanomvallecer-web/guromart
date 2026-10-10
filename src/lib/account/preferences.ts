import "server-only";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type TeachingPreferences = {
  grade: { code: string; name: string } | null;
  subject: { code: string; name: string } | null;
};

/** The grade and subject the signed-in teacher said they teach, or null when signed out or not set. */
export async function getTeachingPreferences(): Promise<TeachingPreferences | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("teaching_preferences")
    .select("grade_levels(code, name), subjects(code, name)")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as { grade_levels: { code: string; name: string } | null; subjects: { code: string; name: string } | null };
  if (!row.grade_levels && !row.subjects) return null;
  return { grade: row.grade_levels, subject: row.subjects };
}
