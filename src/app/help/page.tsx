import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { requireViewer } from "@/lib/auth/dal";
import { helperConfig } from "@/lib/assistant/core";
import { createClient } from "@/lib/supabase/server";
import { HelpFaq } from "./faq";
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
  if (!enabled) return <HelpFaq />;
  const supabase = await createClient();
  const { data } = await supabase.rpc("assistant_questions_left");
  return <HelperChat initialLeft={typeof data === "number" ? data : null} />;
}
