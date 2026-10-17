import { Suspense } from "react";
import { HelpFaq } from "@/app/help/faq";
import { helperConfig } from "@/lib/assistant/core";
import { getViewer } from "@/lib/auth/dal";
import { ChatLauncherPanel } from "./chat-launcher-panel";

/** The floating "Ask GuroMart" button on every page. */
export function ChatLauncher() {
  return (
    <Suspense fallback={null}>
      <ChatLauncherForViewer />
    </Suspense>
  );
}

async function ChatLauncherForViewer() {
  const viewer = await getViewer();
  let enabled = false;
  try {
    enabled = helperConfig() !== null;
  } catch {
    // A bad base URL is reported by /help; here the FAQ is shown instead.
  }
  return (
    <ChatLauncherPanel signedIn={Boolean(viewer)} enabled={enabled}>
      {enabled && viewer ? null : <HelpFaq />}
    </ChatLauncherPanel>
  );
}
