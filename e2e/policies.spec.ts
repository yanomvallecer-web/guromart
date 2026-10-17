import { expect, test } from "@playwright/test";

test("footer links to terms, refunds and contact with a Philippine address", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Footer" });
  await footer.getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms and conditions" })).toBeVisible();
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Refunds" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Return and refund policy" })).toBeVisible();
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Contact" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contact us" })).toBeVisible();
  await expect(page.getByText("Mobo, Masbate, Philippines")).toBeVisible();
});
