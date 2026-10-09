import { expect, test } from "@playwright/test";
import { createLiveListing, serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

// Runs against the local PayMongo stand-in (e2e/paymongo-stand-in.mjs). The
// app must be started with PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET and
// PAYMONGO_API_BASE pointing at it; see README "Testing".
const STAND_IN = process.env.E2E_PAYMONGO_STAND_IN ?? "http://127.0.0.1:4010";

test.describe.configure({ mode: "serial" });

test("paying unlocks downloads only after PayMongo's signed confirmation", async ({ page }) => {
  const listing = await createLiveListing("Checkout Test Summative Exam", 12000);
  const email = uniqueEmail("payer");
  await signIn(page, email, `/resources/${listing.slug}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: "In your cart" })).toBeVisible();

  await page.goto("/cart");
  await page.getByRole("button", { name: "Pay with PayMongo" }).click();
  await page.waitForURL(`${STAND_IN}/checkout/**`);
  await expect(page.getByRole("heading", { name: "PayMongo test stand-in" })).toBeVisible();
  const orderNumber = (await page.getByText(/^Order GM-\d+/).textContent())!.match(/GM-\d+/)![0];
  const checkoutUrl = page.url();

  // Arriving at the success page without a confirmed payment unlocks nothing.
  await page.goto(`/orders/${orderNumber}?from=checkout`);
  await expect(page.getByTestId("order-status")).toHaveText("Waiting for payment");
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Nothing in your library yet" })).toBeVisible();
  expect((await page.request.get(`/library/download/${listing.fileId}`, { maxRedirects: 0 })).status()).toBe(403);

  // Paying sends the signed webhook, then returns to the order page.
  await page.goto(checkoutUrl);
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(`**/orders/${orderNumber}?from=checkout`);
  await expect(page.getByTestId("order-status")).toHaveText("Paid");
  await expect(page.getByText("Paid with: GCash")).toBeVisible();

  await page.getByRole("link", { name: "Open my library" }).click();
  await expect(page.getByRole("link", { name: "Checkout Test Summative Exam" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("worksheet.pdf");

  // The cart is cleared and the seller is credited after the hold period.
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  const buyerId = await userIdFor(email);
  const [order] = await serviceRest(`orders?user_id=eq.${buyerId}&select=id,status,order_items(seller_earnings_centavos,platform_fee_centavos)`);
  expect(order.status).toBe("paid");
  expect(order.order_items).toEqual([{ seller_earnings_centavos: 8400, platform_fee_centavos: 3600 }]);

  // A replayed delivery changes nothing.
  const last = await (await fetch(`${STAND_IN}/last-delivery`)).json();
  const replay = await page.request.post("/api/webhooks/paymongo", {
    data: last.body,
    headers: { "Content-Type": "application/json", "Paymongo-Signature": last.header },
  });
  expect(await replay.json()).toEqual({ received: true, outcome: "duplicate" });
});

test("forged or tampered webhooks are refused", async ({ request }) => {
  const last = await (await fetch(`${STAND_IN}/last-delivery`)).json();
  const tampered = await request.post("/api/webhooks/paymongo", {
    data: last.body.replace(/"amount":\d+/, '"amount":1'),
    headers: { "Content-Type": "application/json", "Paymongo-Signature": last.header },
  });
  expect(tampered.status()).toBe(401);
  const unsigned = await request.post("/api/webhooks/paymongo", { data: last.body, headers: { "Content-Type": "application/json" } });
  expect(unsigned.status()).toBe(401);
});
