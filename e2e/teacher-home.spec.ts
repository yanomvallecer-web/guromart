import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// Signed-in teachers get their own home at "/"; visitors keep the landing page.

test("visitors see the landing page, signed-in teachers their home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Everything you need to teach/ })).toBeVisible();

  const email = uniqueEmail("home");
  await signIn(page, email, "/");
  await expect(page.getByRole("heading", { level: 1, name: /^Magandang (umaga|hapon|gabi), / })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find your next lesson, ready to teach" })).toBeVisible();

  // Without preferences, the quarter plan asks what they teach, and the library card points to free resources.
  await expect(page.getByRole("heading", { name: "Plan your quarters" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Set what I teach" })).toHaveAttribute("href", "/account");
  await expect(page.getByRole("link", { name: "Find free resources" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start selling" }).last()).toBeVisible();

  await page.goto("/account");
  await page.getByRole("combobox", { name: "Grade you teach" }).selectOption({ label: "Grade 4" });
  await page.getByRole("combobox", { name: "Subject you teach" }).selectOption({ label: "Science" });
  await page.getByRole("button", { name: "Save what I teach" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  // The plan and the class filters follow what they teach.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Grade 4 Science", exact: true })).toBeVisible();
  await expect(page.getByText("of 4 quarters have lessons")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Q1/ })).toHaveAttribute("href", /grade=grade-4.*subject=science.*period=quarter-1/);

  // Removing a filter keeps the other and writes "any" for the removed one.
  await page.getByRole("link", { name: "Remove filter: Grade 4" }).click();
  await page.waitForURL("**/?grade=any&subject=science");
  await expect(page.getByRole("link", { name: "Remove filter: Science" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Any grade" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.waitForURL("**/?grade=any&subject=any");
  await expect(page.getByRole("heading", { name: "Popular with teachers" })).toBeVisible();
});
