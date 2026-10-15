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
  await expect(page.getByRole("navigation", { name: "Resource categories" }).getByRole("link", { name: "Presentations" })).toHaveAttribute("href", /\/browse\?.*category=presentation/);
  await expect(page.getByRole("navigation", { name: "Resource categories" }).getByRole("link", { name: "Free resources" })).toHaveAttribute("href", /price=free/);

  const toggle = page.getByRole("button", { name: "Show lesson filters" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("navigation", { name: "Filters for your class" })).toBeVisible();
  await page.getByRole("button", { name: "Hide lesson filters" }).click();
  await expect(page.getByRole("navigation", { name: "Filters for your class" })).not.toBeVisible();

  // Every additional shortcut can scroll into view and opens real filtered results.
  const shortcuts = [
    { label: "Worksheets", category: "worksheet", filter: "Worksheets" },
    { label: "Daily lesson logs", category: "daily-lesson-log", filter: "Daily Lesson Logs" },
    { label: "Assessments", category: "assessment", filter: "Assessments" },
  ];
  for (const shortcut of shortcuts) {
    const rail = page.getByRole("navigation", { name: "Resource categories" });
    await expect.poll(() => rail.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const link = rail.getByRole("link", { name: shortcut.label, exact: true });
    await link.scrollIntoViewIfNeeded();
    expect(await rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/browse\\?.*category=${shortcut.category}`));
    await expect(page.getByRole("link", { name: `Remove filter: ${shortcut.filter}`, exact: true })).toBeVisible();
    await page.goto("/?grade=any&subject=any");
  }

  // Search retains the real browse route; a card's bookmark writes to the real saved library.
  await page.getByRole("searchbox", { name: "Search teaching resources" }).fill(title);
  await page.getByRole("searchbox", { name: "Search teaching resources" }).press("Enter");
  await expect(page).toHaveURL(/\/browse\?.*q=/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.goto("/?grade=any&subject=any&price=free&type=worksheet");
  // The popular shelf is capped at eight cards and shared catalog queries are cached.
  // Save a displayed resource instead of assuming the newest fixture ranks in that shelf.
  const card = page.locator(".teacher-resource-grid > li").first();
  await expect(card).toBeVisible();
  const savedTitle = await card.getByRole("heading").innerText();
  await card.getByRole("button", { name: `Save: ${savedTitle}`, exact: true }).click();
  await expect(card.getByRole("button", { name: `Remove from saved: ${savedTitle}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Saved", exact: true }).click();
  await expect(page).toHaveURL(/\/library\?tab=saved/);
  await expect(page.getByRole("heading", { name: savedTitle, exact: true })).toBeVisible();

  await page.goto("/?grade=any&subject=any");
  // Navigation streams the viewport metadata and stylesheet before the final layout settles.
  await expect.poll(() => page.locator(".teacher-resource-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
