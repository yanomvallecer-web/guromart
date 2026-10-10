"use server";

import { requireArea } from "@/lib/auth/dal";
import { publicEnv } from "@/lib/env";
import { setUpWebhook } from "@/lib/payments/paymongo";

/** Staff only: creates the PayMongo webhook for this site and hands back its signing secret once. */
export async function createPaymentWebhook() {
  await requireArea("admin", "/admin");
  return setUpWebhook(new URL("/api/webhooks/paymongo", publicEnv().NEXT_PUBLIC_SITE_URL).toString());
}
