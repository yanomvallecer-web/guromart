import { expect, test } from "@playwright/test";
import { createLiveListing, signIn, uniqueEmail } from "./helpers";

test("teacher phone home shows branding and products first, with working filters and saved resources", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone storefront regression");
  test.setTimeout(60_000);
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

  // Every circle opens real filtered results and restores shared chrome after Home is hidden.
  const shortcuts = [
    { label: "Presentations", query: "category=presentation", filter: "PowerPoint Presentations" },
    { label: "Lesson plans", query: "category=lesson-plan", filter: "Detailed Lesson Plans" },
    { label: "Printables", query: "category=printable", filter: "Classroom Printables" },
    { label: "Free resources", query: "price=free", filter: "Free" },
    { label: "Worksheets", query: "category=worksheet", filter: "Worksheets" },
    { label: "Daily lesson logs", query: "category=daily-lesson-log", filter: "Daily Lesson Logs" },
    { label: "Assessments", query: "category=assessment", filter: "Assessments" },
  ];
  for (const shortcut of shortcuts) {
    const rail = page.getByRole("navigation", { name: "Resource categories" });
    await expect.poll(() => rail.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const link = rail.getByRole("link", { name: shortcut.label, exact: true });
    await link.scrollIntoViewIfNeeded();
    if (["Worksheets", "Daily lesson logs", "Assessments"].includes(shortcut.label)) {
      expect(await rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/browse\\?.*${shortcut.query}`));
    await expect(page.getByRole("link", { name: `Remove filter: ${shortcut.filter}`, exact: true })).toBeVisible();
    await expect(page.locator("[data-site-header]")).toBeVisible();
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator(".teacher-phone-header")).toBeVisible();
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

test("phone resource has a persistent back header and purchase labels fit narrow screens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone resource navigation regression");
  test.setTimeout(60_000);
  const title = `Phone navigation resource ${Date.now()}`;
  const listing = await createLiveListing(title, 3000);
  await signIn(page, uniqueEmail("phone-resource-navigation"), "/");
  await expect(page.locator(".teacher-phone-header")).toBeVisible();
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Browse", exact: true }).click();
  await expect(page.locator("[data-site-header]")).toBeVisible();

  const catalog = `/browse?q=${encodeURIComponent(title)}&all=1`;
  await page.goto(catalog);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const header = page.getByRole("navigation", { name: "Resource navigation", exact: true });
  await expect(header.getByRole("link", { name: "Back to resources", exact: true })).toBeVisible();

  const bar = page.getByTestId("buy-bar");
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ["Add to cart", "Buy now"]) {
      const button = bar.getByRole("button", { name: label, exact: true });
      await expect(button).toBeVisible();
      await expect.poll(() => button.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return text.left >= box.left && text.right <= box.right && box.left >= 0 && box.right <= innerWidth && box.height >= 44;
      })).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("heading", { name: "About this resource", exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => header.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await header.getByRole("link", { name: "Back to resources", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/browse\\?q=${encodeURIComponent(title)}&all=1$`));

  // A direct launch has no previous in-app entry: Back still opens the catalog safely.
  await page.goto(`/resources/${listing.slug}`);
  await page.getByRole("link", { name: "Back to resources", exact: true }).click();
  await expect(page).toHaveURL(/\/browse$/);
});
