import Link from "next/link";
import { Bookmark } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { SaveButton } from "./save-button";

/** Save for later: a sign-in link for visitors, the toggle for signed-in teachers. */
export async function SaveControl({ productId, path }: { productId: string; path: string }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}>
        <Bookmark aria-hidden /> Save
      </Link>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from("wishlists").select("product_id").eq("user_id", viewer.id).eq("product_id", productId).maybeSingle();
  return <SaveButton productId={productId} path={path} initiallySaved={Boolean(data)} />;
}
