import { expect, test } from "@playwright/test";
import { createLiveListing, signIn, uniqueEmail } from "./helpers";

test("teacher phone home shows branding and products first, with working filters and saved resources", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone storefront regression");
  const title = `Phone home resource ${Date.now()}`;
  await createLiveListing(title, 0);
  await signIn(page, uniqueEmail("phone-home"), "/");
  await page.goto("/?grade=any&subject=any");

  await expect(page.getByRole("link", { name: "GuroMart home" })).toContainText("GuroMart");
  await expect(page.getByRole("heading", { name: "Find your next lesson, ready to teach" })).not.toBeVisible();
  await expect(page.getByRole("search")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Resource categories" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Resource categories" }).getByRole("link", { name: "Presentations" })).toHaveAttribute("href", /type=presentation/);
  await expect(page.getByRole("navigation", { name: "Resource categories" }).getByRole("link", { name: "Free resources" })).toHaveAttribute("href", /price=free/);

  const toggle = page.getByRole("button", { name: "Show lesson filters" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("navigation", { name: "Filters for your class" })).toBeVisible();
  await page.getByRole("button", { name: "Hide lesson filters" }).click();
  await expect(page.getByRole("navigation", { name: "Filters for your class" })).not.toBeVisible();

  // Search retains the real browse route; a card's bookmark writes to the real saved library.
  await page.getByRole("searchbox", { name: "Search teaching resources" }).fill(title);
  await page.getByRole("searchbox", { name: "Search teaching resources" }).press("Enter");
  await expect(page).toHaveURL(/\/browse\?.*q=/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.goto("/?grade=any&subject=any&price=free&type=worksheet");
  const card = page.locator(".teacher-resource-grid > li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: `Save: ${title}`, exact: true }).click();
  await expect(card.getByRole("button", { name: `Remove from saved: ${title}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Saved", exact: true }).click();
  await expect(page).toHaveURL(/\/library\?tab=saved/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.goto("/?grade=any&subject=any");
  const columns = await page.locator(".teacher-resource-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
