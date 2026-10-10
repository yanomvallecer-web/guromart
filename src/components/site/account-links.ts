import { Bell, BookOpen, FileText, Layers, type LucideIcon, Receipt, ShieldCheck, Store, User, Wallet } from "lucide-react";
import type { Viewer } from "@/lib/auth/dal";

export type AccountLink = { href: string; label: string; icon: LucideIcon };

/** Where a signed-in teacher can go from their account, by role. Shared by the header menu and the account page. */
export function accountLinks(viewer: Viewer): AccountLink[] {
  const isSeller = viewer.roles.includes("seller");
  const isAdmin = viewer.roles.includes("admin");
  return [
    { href: "/account", label: "My account", icon: User },
    { href: "/library", label: "My library", icon: BookOpen },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/orders", label: "Orders", icon: Receipt },
    ...(isSeller
      ? [
          { href: "/seller", label: "Seller dashboard", icon: Store },
          { href: "/seller/earnings", label: "Earnings", icon: Wallet },
          { href: "/seller/products", label: "My resources", icon: FileText },
          { href: "/seller/bundles", label: "Lesson bundles", icon: Layers },
        ]
      : [{ href: "/sell", label: "Start selling", icon: Store }]),
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
}
