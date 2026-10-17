import { expect, test } from "@playwright/test";
import { createLiveListing, serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

const STAND_IN = process.env.E2E_PAYMONGO_STAND_IN ?? "http://127.0.0.1:4010";

test("an admin sees a paid sale on the dashboard and the Sales page", async ({ page, browser }) => {
  // A teacher pays through the PayMongo stand-in.
  const title = `Admin Sales Test ${Date.now()}`;
  const listing = await createLiveListing(title, 15000);
  const buyerEmail = uniqueEmail("sales-buyer");
  const buyer = await browser.newPage();
  await signIn(buyer, buyerEmail, `/resources/${listing.slug}`);
  await buyer.getByRole("button", { name: "Add to cart" }).click();
  await expect(buyer.getByRole("link", { name: "In your cart" })).toBeVisible();
  await buyer.goto("/cart");
  await buyer.getByRole("button", { name: "Pay with PayMongo" }).click();
  await buyer.waitForURL(`${STAND_IN}/checkout/**`);
  const orderNumber = (await buyer.getByText(/^Order GM-\d+/).textContent())!.match(/GM-\d+/)![0];
  await buyer.getByRole("button", { name: "Pay (test)" }).click();
  await buyer.waitForURL(`**/orders/${orderNumber}?from=checkout`);
  await expect(buyer.getByTestId("order-status")).toHaveText("Paid");
  await buyer.close();

  const staffEmail = uniqueEmail("sales-admin");
  await signIn(page, staffEmail, "/account");
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: await userIdFor(staffEmail), role: "admin" }) });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
  await expect(page.getByTestId("latest-sales")).toContainText(title);
  await expect(page.getByTestId("admin-attention")).toContainText("Resources waiting for review");
  await expect(page.getByTestId("payments-check")).toBeVisible();

  await page.getByRole("link", { name: "See sales" }).click();
  await expect(page.getByRole("heading", { name: "Sales", exact: true })).toBeVisible();
  await expect(page.getByTestId("sales-summary").filter({ visible: true })).toContainText("All-time sales");
  await expect(page.getByTestId("sales-chart").filter({ visible: true })).toHaveCount(1);
  const row = page.getByTestId("orders-table").getByRole("row", { name: new RegExp(orderNumber) });
  await expect(row).toContainText(title);
  await expect(row).toContainText(buyerEmail);
  await expect(row).toContainText("₱150.00");
  await expect(row).toContainText("GCash");
  await expect(row).toContainText("Test payment");
  await expect(row).toContainText("Paid");

  // A buyer can't open it.
  const other = await browser.newPage();
  await signIn(other, uniqueEmail("sales-nosy"), "/account");
  await other.goto("/admin/sales");
  await expect(other.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await other.close();
});
