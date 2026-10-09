import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getViewer } from "@/lib/auth/dal";
import { getCartCount } from "@/lib/commerce/cart";

/** Cart icon with the number of resources in it. Only shown to signed-in teachers. */
export async function CartLink() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const count = await getCartCount(viewer);
  return (
    <Link
      href="/cart"
      aria-label={count ? `Cart, ${count} ${count === 1 ? "resource" : "resources"}` : "Cart"}
      className="relative flex size-11 items-center justify-center rounded-[10px] hover:bg-surface-muted"
    >
      <ShoppingCart className="size-5" aria-hidden />
      {count ? (
        <span className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
