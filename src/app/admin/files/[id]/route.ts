import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff download of a seller's file for review. The row is read through RLS as
 * staff, the download is audited, and the link to the private object expires
 * after five minutes.
 */
export async function GET(_request: Request, ctx: RouteContext<"/admin/files/[id]">) {
  const { id } = await ctx.params;
  const viewer = await requireArea("admin", "/admin/listings");
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: file } = await supabase
    .from("product_files")
    .select("id, product_id, storage_path, original_filename")
    .eq("id", id)
    .maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("product-files")
    .createSignedUrl(file.storage_path, 300, { download: file.original_filename });
  if (error || !data) return new NextResponse("The file is unavailable right now.", { status: 502 });

  await admin.from("audit_logs").insert({
    actor_id: viewer.id,
    action: "product_file.staff_download",
    entity_type: "product",
    entity_id: file.product_id,
    metadata: { file_id: file.id },
  });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
