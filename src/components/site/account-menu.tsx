import Link from "next/link";
import { BookOpen, ChevronDown, LogOut, ShieldCheck, Store, User, FileText } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/dal";

export async function AccountMenu() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/sign-in" className={buttonVariants({ variant: "dark", size: "md" })}>
        Sign in
      </Link>
    );
  }
  const isSeller = viewer.roles.includes("seller");
  const isAdmin = viewer.roles.includes("admin");
  const item = "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted [&_svg]:size-4";
  return (
    <details className="group relative">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-primary">
          {viewer.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{viewer.displayName}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-60 rounded-[12px] border border-border bg-surface p-1.5 shadow-lg">
        <p className="truncate px-3 py-2 text-xs text-muted-foreground">{viewer.email}</p>
        <Link href="/account" className={item}>
          <User /> My account
        </Link>
        <Link href="/library" className={item}>
          <BookOpen /> My library
        </Link>
        {isSeller ? (
          <Link href="/seller" className={item}>
            <Store /> Seller dashboard
          </Link>
        ) : null}
        {isSeller ? (
          <Link href="/seller/products" className={item}>
            <FileText /> My resources
          </Link>
        ) : (
          <Link href="/sell" className={item}>
            <Store /> Start selling
          </Link>
        )}
        {isAdmin ? (
          <Link href="/admin" className={item}>
            <ShieldCheck /> Admin
          </Link>
        ) : null}
        <form action={signOut}>
          <button type="submit" className={`${item} w-full`}>
            <LogOut /> Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

export function AccountMenuFallback() {
  return <div className="h-11 w-24 animate-pulse rounded-[10px] bg-border/60" aria-hidden />;
}

