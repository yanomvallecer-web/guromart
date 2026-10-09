import { expect, test } from "@playwright/test";
import { createLiveListing, serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

// Locators use roles, not labels: the router keeps earlier pages mounted but hidden.
test.describe.configure({ mode: "serial" });

test("a teacher gets a free resource and downloads it from their library", async ({ page }) => {
  const free = await createLiveListing("Free Library Test Worksheet", 0);

  await page.goto(`/resources/${free.slug}`);
  await expect(page.getByRole("link", { name: "Sign in to get it free" })).toBeVisible();

  const email = uniqueEmail("getter");
  await signIn(page, email, `/resources/${free.slug}`);
  await page.getByRole("button", { name: "Get it free" }).click();
  await expect(page.getByRole("link", { name: "In your library" })).toBeVisible();

  await page.goto("/library");
  await expect(page.getByText("Free Library Test Worksheet")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("worksheet.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe("%PDF-");

  const userId = await userIdFor(email);
  const logged = await serviceRest(`downloads?user_id=eq.${userId}&select=product_file_id`);
  expect(logged).toEqual([{ product_file_id: free.fileId }]);
  const [counted] = await serviceRest(`products?id=eq.${free.productId}&select=download_count`);
  expect(counted.download_count).toBe(1);
});

test("a paid resource goes in the cart and can't be downloaded before it is paid for", async ({ page }) => {
  const paid = await createLiveListing("Paid Cart Test Reviewer", 7500);
  await signIn(page, uniqueEmail("carter"), `/resources/${paid.slug}`);

  // No access yet: the download route refuses and nothing is signed.
  const refused = await page.request.get(`/library/download/${paid.fileId}`, { maxRedirects: 0 });
  expect(refused.status()).toBe(403);

  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: "In your cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, 1 resource" })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("link", { name: "Paid Cart Test Reviewer" })).toBeVisible();
  await expect(page.getByText("₱75.00").first()).toBeVisible();

  await page.getByRole("button", { name: "Remove from cart" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});
