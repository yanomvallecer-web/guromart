import Link from "next/link";
import { UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { MessageSellerButton } from "@/components/commerce/message-seller";
import { FollowButton, FollowerCount } from "./follow-button";

/**
 * Follow and message buttons for a shop: a sign-in link for visitors, and
 * neither for the shop's own seller (who sees the follower count).
 */
export async function FollowControl({ storefrontId, path, productId }: { storefrontId: string; path: string; productId?: string }) {
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
        <MessageSellerButton storefrontId={storefrontId} productId={productId} from={path} />
        <FollowerCount n={followers} />
      </div>
    );
  }
  if (own?.data) return <FollowerCount n={followers} />;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <FollowButton storefrontId={storefrontId} path={path} initiallyFollowing={Boolean(follow?.data)} followers={followers} />
      <MessageSellerButton storefrontId={storefrontId} productId={productId} from={path} />
    </div>
  );
}
