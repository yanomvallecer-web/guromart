import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * A buyer's download. The database checks the entitlement and logs the
 * download as the signed-in user; only then does the server sign a link to the
 * private file, valid for one minute.
 */
export async function GET(request: Request, ctx: RouteContext<"/library/download/[fileId]">) {
  const { fileId } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent("/library")}`, request.url), 303);
  }
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_download", { p_file_id: fileId }).single<{ storage_path: string; file_name: string }>();
  if (error || !data) {
    const status = error?.code === "54000" ? 429 : error?.code === "42501" ? 403 : 404;
    const message =
      status === 429 ? "Too many downloads in the last hour. Please try again later." :
      status === 403 ? "You don't have access to this file." :
      "This file is not available right now.";
    return new NextResponse(message, { status, headers: { "Cache-Control": "no-store" } });
  }

  const { data: signed, error: signError } = await createAdminClient()
    .storage.from("product-files")
    .createSignedUrl(data.storage_path, 60, { download: data.file_name });
  if (signError || !signed) return new NextResponse("The file is unavailable right now. Please try again.", { status: 502 });
  return NextResponse.redirect(signed.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
