import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Suspense } from "react";
import { accountLinks } from "@/components/site/account-links";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Badge, Card } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <PageShell title="My account">
      <Suspense fallback={<PanelSkeleton />}>
        <AccountBody />
      </Suspense>
    </PageShell>
  );
}

async function AccountBody() {
  const viewer = await requireArea("account", "/account");
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, school_name, region")
    .eq("id", viewer.id)
    .single();
  if (error) throw new Error("Could not load your profile.");
  const row = "flex min-h-12 w-full items-center gap-3 px-4 text-[15px] font-semibold hover:bg-surface-muted [&>svg]:size-5";
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      {/* Phones: the header menu is replaced by the tab bar, so its links live here. */}
      <nav aria-label="Your GuroMart" className="md:hidden">
        <Card className="divide-y divide-border overflow-hidden">
          {accountLinks(viewer)
            .filter((l) => l.href !== "/account")
            .map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={row}>
                <Icon className="text-primary" aria-hidden /> <span className="flex-1">{label}</span>
                <ChevronRight className="text-muted-foreground" aria-hidden />
              </Link>
            ))}
          <form action={signOut}>
            <button type="submit" className={row}>
              <LogOut className="text-muted-foreground" aria-hidden /> Sign out
            </button>
          </form>
        </Card>
      </nav>
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Profile</h2>
        <ProfileForm profile={profile} />
      </Card>
      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-xl font-bold">Sign-in</h2>
        <p className="text-sm text-muted-foreground">{viewer.email}</p>
        <div className="flex flex-wrap gap-2">
          <Badge>Buyer</Badge>
          {viewer.roles.map((r) => (
            <Badge key={r} className="capitalize">{r}</Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
