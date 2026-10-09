import type { Metadata } from "next";
import { Suspense } from "react";
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
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
