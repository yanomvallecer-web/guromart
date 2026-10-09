import { expect, test } from "@playwright/test";
import { serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("a seller edits their shop profile, adds a logo, and can hide the shop", async ({ page, browser }) => {
  const email = uniqueEmail("shopedit");
  const slug = `shopedit-${Date.now()}`;
  await signIn(page, email, "/sell");
  await page.getByText("Teacher", { exact: true }).click();
  await page.getByRole("textbox", { name: "Shop name" }).fill("Draft Name");
  await page.getByRole("textbox", { name: "Shop address" }).fill(slug);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my shop" }).click();
  await page.waitForURL("**/seller");
  await page.getByRole("link", { name: "Edit shop profile" }).click();
  await page.waitForURL("**/seller/shop");
  await expect(page.getByTestId("shop-visibility")).toHaveText("Your shop goes live when GuroMart approves your first resource.");

  await page.getByRole("textbox", { name: "Shop name" }).fill("Ma'am Liza Science Corner");
  await page.getByRole("textbox", { name: "Tagline (optional)" }).fill("Ready-to-print Grade 4 Science worksheets");
  await page.getByRole("textbox", { name: "About your shop (optional)" }).fill("Public school teacher in Laguna sharing what works in my class.");
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByText("Shop saved.")).toBeVisible();

  // A PDF can't be a logo; a real image can.
  await page.locator("#shop-logo").setInputFiles({ name: "logo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  await expect(page.getByText("Shop images must be PNG, JPG or WebP.")).toBeVisible();
  await page.locator("#shop-logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("shop-logo-image")).toBeVisible();

  // Staff activate the seller (normally by approving a first listing); the shop and its profile are now public.
  const [account] = await serviceRest(`seller_accounts?user_id=eq.${await userIdFor(email)}&select=id`);
  await serviceRest(`seller_accounts?id=eq.${account.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
  await serviceRest(`storefronts?slug=eq.${slug}`, { method: "PATCH", body: JSON.stringify({ is_published: true }) });

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/shop/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Ma'am Liza Science Corner" })).toBeVisible();
  await expect(visitor.getByText("Ready-to-print Grade 4 Science worksheets")).toBeVisible();
  await expect(visitor.getByRole("img", { name: "Ma'am Liza Science Corner logo" })).toBeVisible();

  // Hiding the shop takes it off the site.
  await page.reload();
  await expect(page.getByTestId("shop-visibility")).toHaveText("Your shop is visible to teachers.");
  await page.getByRole("checkbox", { name: /Show my shop to teachers/ }).uncheck();
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByText("Shop saved.")).toBeVisible();
  await visitor.goto(`/shop/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Ma'am Liza Science Corner" })).toHaveCount(0);
  await visitorContext.close();
});
