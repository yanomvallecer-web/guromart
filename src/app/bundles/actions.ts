"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/** Staff only: hide a bundle from the marketplace, or show it again (as a draft the seller can fix and republish). */
export async function setBundleHidden(bundleId: string, hidden: boolean): Promise<void> {
  await requireArea("admin", "/admin");
  if (!z.uuid().safeParse(bundleId).success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("bundles").update({ status: hidden ? "hidden" : "draft" }).eq("id", bundleId).select("slug").maybeSingle();
  if (data) revalidatePath(`/bundles/${data.slug}`);
}
