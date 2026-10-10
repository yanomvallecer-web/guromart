import { expect, test } from "@playwright/test";

test("homepage leads with real resources, then grades and subjects that have some", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Everything you need to teach, all in one place." })).toBeVisible();
  // Resources come right after the hero, with the rule that picked them.
  const featured = page.getByRole("region", { name: "Featured resources" });
  await expect(featured.getByText("Most bought and downloaded first, then newest.")).toBeVisible();
  expect(await featured.getByRole("listitem").count()).toBeGreaterThan(0);
  // Grades and subjects only appear with a live count, and lead to matching results.
  const grades = page.getByRole("region", { name: "Available grades and subjects" });
  await expect(grades.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/browse");
  const first = grades.getByRole("listitem").getByRole("link").first();
  const label = (await first.textContent())!;
  const shown = Number(label.match(/(\d+)\D*$/)![1]);
  expect(shown).toBeGreaterThan(0);
  await first.click();
  await expect(page).toHaveURL(/\/browse\?(grade|subject)=/);
  expect(Number((await page.getByTestId("result-count").textContent())!.split(" ")[0])).toBe(shown);
  await page.goBack();
  await expect(page.getByRole("link", { name: "Start selling" })).toBeVisible();
  // A shelf is either filled with real listings or not shown at all.
  await expect(page.getByText("Nothing here yet")).toHaveCount(0);
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
