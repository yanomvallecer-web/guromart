import { Suspense } from "react";
import { getViewer } from "@/lib/auth/dal";
import { getCartCount } from "@/lib/commerce/cart";
import { TabBarNav } from "./tab-bar-nav";

/** Bottom tab bar for phones (hidden from md up, where the header has the full menu). */
export function TabBar() {
  return (
    // The bar reads the URL to mark the current tab, so it renders inside Suspense;
    // the page keeps its bottom padding meanwhile, so nothing jumps when it appears.
    <Suspense fallback={null}>
      <TabBarForViewer />
    </Suspense>
  );
}

async function TabBarForViewer() {
  const viewer = await getViewer();
  const cartCount = viewer ? await getCartCount(viewer) : 0;
  return <TabBarNav signedIn={Boolean(viewer)} cartCount={cartCount} />;
}
