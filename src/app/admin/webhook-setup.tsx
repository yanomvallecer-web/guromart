"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createPaymentWebhook } from "./payment-actions";

/** Creates the PayMongo webhook and shows its secret so staff can store it in Vercel. */
export function WebhookSetup() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof createPaymentWebhook>> | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="w-fit" disabled={pending} onClick={() => start(async () => setResult(await createPaymentWebhook()))}>
        {pending ? "Setting up…" : "Set up the PayMongo webhook"}
      </Button>
      {result?.ok ? (
        <div className="flex flex-col gap-2 rounded-[10px] bg-surface-muted p-3 text-sm" data-testid="webhook-secret">
          <p>
            {result.existed ? "The webhook already exists." : "Webhook created."} Copy its secret into Vercel as <code>PAYMONGO_WEBHOOK_SECRET</code>{" "}
            (Production and Preview), then ask for a redeploy. Don&apos;t share it anywhere else.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface px-2 py-1">{result.secret.slice(0, 8)}••••••••</code>
            <Button
              type="button"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(result.secret).then(() => setCopied(true))}
            >
              {copied ? "Copied" : "Copy secret"}
            </Button>
          </div>
        </div>
      ) : result ? (
        <p className="text-sm text-danger">{result.error}</p>
      ) : null}
    </div>
  );
}
