"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/dal";
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
