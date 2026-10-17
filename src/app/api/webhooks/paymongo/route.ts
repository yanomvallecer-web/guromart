import { NextResponse } from "next/server";
import { parseWebhookEvent, paymongoConfig, verifyWebhookSignature } from "@/lib/payments/paymongo";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PayMongo webhook. The only path that marks an order paid and unlocks
 * downloads. The signature is checked against the raw body first; the
 * database then applies the event once, whatever PayMongo retries.
 */
export async function POST(request: Request) {
  const config = paymongoConfig();
  if (!config) return new NextResponse("Payments are not configured.", { status: 503 });

  const rawBody = await request.text();
  const signature = verifyWebhookSignature(request.headers.get("paymongo-signature"), rawBody, config.webhookSecret);
  if (!signature.ok) return new NextResponse("Invalid signature.", { status: 401 });

  const event = parseWebhookEvent(rawBody);
  if (!event) return new NextResponse("Malformed event.", { status: 400 });
  // Only events from the mode the site is running in are applied: test events never touch a live shop, and live events need the live switch on.
  if (signature.livemode !== config.live || event.livemode !== config.live) {
    return NextResponse.json({ received: true, outcome: event.livemode ? "live_ignored" : "test_ignored" });
  }

  const { data, error } = await createAdminClient().rpc("apply_payment_event", {
    p_event_id: event.eventId,
    p_event_type: event.type,
    p_payload: JSON.parse(rawBody),
    p_livemode: event.livemode,
    p_checkout_id: event.checkoutId,
    p_payment_id: event.paymentId,
    p_amount: event.amountCentavos,
    p_fee: event.feeCentavos,
    p_method: event.method,
    // Only sent for failed attempts, so paid events keep working against a
    // database that predates failed-payment support.
    ...(event.type === "payment.failed" ? { p_payment_intent_id: event.paymentIntentId, p_failure: event.failureMessage } : {}),
  });
  // A 5xx makes PayMongo retry later; the event id keeps a retry from applying twice.
  if (error) {
    console.error("PayMongo webhook could not be applied", { eventId: event.eventId, error: error.message });
    return new NextResponse("Could not record the event.", { status: 500 });
  }
  return NextResponse.json({ received: true, outcome: data });
}
