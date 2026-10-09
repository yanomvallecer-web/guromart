import { expect, test } from "@playwright/test";

test("homepage shows real categories and honest empty states", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Everything you need to teach, all in one place." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kindergarten" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Araling Panlipunan" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Daily Lesson Logs" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Start selling" })).toBeVisible();
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
