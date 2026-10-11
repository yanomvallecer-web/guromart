import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/dal";
import { helperConfig } from "@/lib/assistant/core";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_EMAIL } from "@/lib/site";
import { HelperChat } from "./helper-chat";

export const metadata: Metadata = { title: "Ask GuroMart", robots: { index: false } };

export default function HelpPage() {
  return (
    <PageShell title="Ask GuroMart" description="Questions about buying, refunds, selling, fees and payouts, or help finding a resource.">
      <Suspense fallback={<PanelSkeleton />}>
        <Helper />
      </Suspense>
    </PageShell>
  );
}

async function Helper() {
  await requireViewer("/help");
  let enabled = false;
  try {
    enabled = helperConfig() !== null;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
  }
  if (!enabled) {
    return (
      <Card className="flex flex-col gap-2 p-5" data-testid="helper-unavailable">
        <p className="font-semibold">The GuroMart helper isn&apos;t available yet.</p>
        <p className="text-sm text-muted-foreground">
          Until it is, the <Link href="/refunds" className="font-semibold text-primary hover:underline">refund policy</Link>,{" "}
          <Link href="/sell" className="font-semibold text-primary hover:underline">selling guide</Link> and{" "}
          <Link href="/terms" className="font-semibold text-primary hover:underline">terms</Link> answer most questions, or email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </Card>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("assistant_questions_left");
  return <HelperChat initialLeft={typeof data === "number" ? data : null} />;
}
