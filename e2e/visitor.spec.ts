import { expect, test } from "@playwright/test";

test("homepage shows real categories and no empty shelves", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Everything you need to teach, all in one place." })).toBeVisible();
  // One row of grades, with the full set of filters a tap away.
  const grades = page.getByRole("region", { name: "Browse by grade" });
  await expect(grades.getByRole("link", { name: "Kindergarten" })).toBeVisible();
  await expect(grades.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/browse");
  await expect(page.getByRole("link", { name: "Daily Lesson Logs" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Start selling" })).toBeVisible();
  // A shelf is either filled with real listings or not shown at all.
  await expect(page.getByText("Nothing here yet")).toHaveCount(0);
  for (const shelf of await page.locator("section[aria-labelledby$='-h']").filter({ has: page.getByRole("link", { name: "See all" }) }).all()) {
    if ((await shelf.getAttribute("aria-labelledby")) === "grades-h") continue;
    expect(await shelf.getByRole("listitem").count()).toBeGreaterThan(0);
  }
});

test("search goes to server-filtered results", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("search").first();
  await search.getByRole("searchbox").fill("photosynthesis worksheet");
  await search.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/browse\?q=photosynthesis\+worksheet/);
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
});

test("protected areas send visitors to sign in", async ({ page }) => {
  await page.goto("/seller");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fseller/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin/);
});

test("unknown resources return not found", async ({ page }) => {
  const res = await page.goto("/resources/does-not-exist");
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  expect(res?.status()).toBeLessThan(500);
});
