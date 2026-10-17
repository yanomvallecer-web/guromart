"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/dal";
import { getTaxonomy } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/validation/profile";

export type ProfileState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await requireViewer("/account");
  const parsed = profileSchema.safeParse({
    display_name: formData.get("display_name"),
    school_name: formData.get("school_name") ?? "",
    region: formData.get("region") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  // RLS also restricts this update to the caller's own row.
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", viewer.id);
  if (error) return { error: "We couldn't save your profile. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export type PreferencesState = { ok?: boolean; error?: string };

const prefCode = z.string().regex(/^[a-z0-9-]{0,60}$/).catch("");

/** Remembers the grade and subject the teacher teaches, used to start Browse on matching resources. Both empty clears it. */
export async function updateTeachingPreferences(_prev: PreferencesState, formData: FormData): Promise<PreferencesState> {
  const viewer = await requireViewer("/account");
  const grade = prefCode.parse(formData.get("grade") ?? "");
  const subject = prefCode.parse(formData.get("subject") ?? "");
  const taxonomy = await getTaxonomy();
  const gradeId = grade ? taxonomy.grades.find((g) => g.code === grade)?.id : null;
  const subjectId = subject ? taxonomy.subjects.find((s) => s.code === subject)?.id : null;
  if (gradeId === undefined || subjectId === undefined) return { error: "Choose a grade and subject from the lists." };

  const supabase = await createClient();
  const { error } =
    gradeId === null && subjectId === null
      ? await supabase.from("teaching_preferences").delete().eq("user_id", viewer.id)
      : await supabase.from("teaching_preferences").upsert({ user_id: viewer.id, grade_level_id: gradeId, subject_id: subjectId }, { onConflict: "user_id" });
  if (error) return { error: "We couldn't save this. Please try again." };
  revalidatePath("/account");
  revalidatePath("/browse");
  return { ok: true };
}
