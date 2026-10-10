import Link from "next/link";
import { UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FollowButton, FollowerCount } from "./follow-button";

/** The follow button for a shop: sign-in link for visitors, nothing to follow for the shop's own seller. */
export async function FollowControl({ storefrontId, path }: { storefrontId: string; path: string }) {
  const supabase = await createClient();
  const viewer = await getViewer();
  const [{ data: n }, follow, own] = await Promise.all([
    supabase.rpc("shop_follower_count", { p_storefront_id: storefrontId }),
    viewer ? supabase.from("shop_follows").select("storefront_id").eq("user_id", viewer.id).eq("storefront_id", storefrontId).maybeSingle() : null,
    // Seller accounts are only readable by their owner, so this matches only the viewer's own shop.
    viewer ? supabase.from("storefronts").select("id, seller_accounts!inner(user_id)").eq("id", storefrontId).eq("seller_accounts.user_id", viewer.id).maybeSingle() : null,
  ]);
  const followers = typeof n === "number" ? n : 0;
  if (!viewer) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className={cn(buttonVariants({ size: "sm" }), "h-11")}>
          <UserPlus aria-hidden /> Follow shop
        </Link>
        <FollowerCount n={followers} />
      </div>
    );
  }
  if (own?.data) return <FollowerCount n={followers} />;
  return <FollowButton storefrontId={storefrontId} path={path} initiallyFollowing={Boolean(follow?.data)} followers={followers} />;
}
