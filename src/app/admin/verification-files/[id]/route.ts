import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Staff view of a seller's ID: read through RLS as staff, logged, five-minute link. */
export async function GET(_request: Request, ctx: RouteContext<"/admin/verification-files/[id]">) {
  const { id } = await ctx.params;
  const viewer = await requireArea("admin", "/admin/verifications");
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("seller_verifications")
    .select("id, seller_account_id, document_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("verification-documents").createSignedUrl(row.document_path, 300);
  if (error || !data) return new NextResponse("The document is unavailable right now.", { status: 502 });
  await admin.from("audit_logs").insert({
    actor_id: viewer.id,
    action: "seller.verification_viewed",
    entity_type: "seller_account",
    entity_id: row.seller_account_id,
    metadata: { verification_id: row.id },
  });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
