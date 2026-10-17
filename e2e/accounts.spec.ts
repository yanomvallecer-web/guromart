import { expect, test } from "@playwright/test";
import { serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

test("a teacher signs up with an email code and edits their profile", async ({ page }) => {
  const email = uniqueEmail("buyer");
  await signIn(page, email, "/account");
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
  await expect(page.getByRole("main").getByText(email)).toBeVisible();

  await page.getByLabel("Name shown on GuroMart").fill("Teacher Ana");
  await page.getByLabel("School (optional)").fill("Rizal Elementary School");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name shown on GuroMart")).toHaveValue("Teacher Ana");
  await expect(page.getByLabel("School (optional)")).toHaveValue("Rizal Elementary School");

  // A buyer is turned away from seller and admin areas by the server.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await page.goto("/seller");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();

  await page.locator("summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("a teacher opens a shop and a staff-published listing appears in search", async ({ page, browser }) => {
  const email = uniqueEmail("seller");
  const slug = `shop-${Date.now()}`;
  await signIn(page, email, "/sell");
  await page.getByText("Teacher", { exact: true }).click();
  await page.getByLabel("Shop name").fill("Teacher Liza Prints");
  await page.getByLabel("Shop address").fill(slug);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my shop" }).click();
  await page.waitForURL("**/seller");
  await expect(page.getByText("Teacher Liza Prints")).toBeVisible();
  await expect(page.getByText("Setting up")).toBeVisible();

  // Taking a shop address twice is refused.
  const other = await browser.newPage();
  await signIn(other, uniqueEmail("seller2"), "/sell");
  await other.getByText("Teacher", { exact: true }).click();
  await other.getByLabel("Shop name").fill("Copycat");
  await other.getByLabel("Shop address").fill(slug);
  await other.getByRole("checkbox").check();
  await other.getByRole("button", { name: "Open my shop" }).click();
  await expect(other.getByText("That shop address is taken. Try another.")).toBeVisible();
  await other.close();

  // Staff activate the seller and publish a listing (admin tools come in Phase 4).
  const userId = await userIdFor(email);
  const [account] = await serviceRest(`seller_accounts?user_id=eq.${userId}&select=id,storefronts(id)`);
  const storefrontId: string = account.storefronts.id;
  await serviceRest(`seller_accounts?id=eq.${account.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
  await serviceRest(`storefronts?id=eq.${storefrontId}`, { method: "PATCH", body: JSON.stringify({ is_published: true }) });
  const [category] = await serviceRest("product_categories?code=eq.worksheet&select=id");
  const productSlug = `fractions-${Date.now()}`;
  await serviceRest("products", {
    method: "POST",
    body: JSON.stringify({
      storefront_id: storefrontId,
      slug: productSlug,
      title: "Adding dissimilar fractions worksheet",
      description: "Twenty practice items with an answer key. [e2e test data]",
      category_id: category.id,
      price_centavos: 4500,
      copyright_declared_at: new Date().toISOString(),
      status: "published",
    }),
  });

  await page.goto(`/resources/${productSlug}`);
  await expect(page.getByRole("heading", { name: "Adding dissimilar fractions worksheet" })).toBeVisible();
  await expect(page.getByText("₱45.00")).toBeVisible();
  await page.goto(`/browse?q=dissimilar+fractions&shop=${slug}`);
  await expect(page.getByRole("link", { name: /Adding dissimilar fractions worksheet/ })).toBeVisible();

  // Grant admin and check the overview counts the shop and the audit trail.
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: userId, role: "admin" }) });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-activity").getByText("Someone started setting up a shop").first()).toBeVisible();
});

test("an admin lists accounts, filters to sellers and searches by email", async ({ page, browser }) => {
  const buyerEmail = uniqueEmail("listed-buyer");
  const buyer = await browser.newPage();
  await signIn(buyer, buyerEmail, "/account");
  // Buyers can't open the list.
  await buyer.goto("/admin/accounts");
  await expect(buyer.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await buyer.close();

  const sellerEmail = uniqueEmail("listed-seller");
  const seller = await browser.newPage();
  await signIn(seller, sellerEmail, "/sell");
  await seller.getByText("Teacher", { exact: true }).click();
  await seller.getByLabel("Shop name").fill("Listed Lessons");
  await seller.getByLabel("Shop address").fill(`listed-${Date.now()}`);
  await seller.getByRole("checkbox").check();
  await seller.getByRole("button", { name: "Open my shop" }).click();
  await seller.waitForURL("**/seller");
  await seller.close();

  const staffEmail = uniqueEmail("accounts-admin");
  await signIn(page, staffEmail, "/account");
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: await userIdFor(staffEmail), role: "admin" }) });
  await page.goto("/admin");
  await page.getByRole("link", { name: "Accounts Everyone who signed up" }).click();
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  const table = page.getByTestId("accounts-table");
  await expect(table.getByRole("row", { name: new RegExp(buyerEmail) })).toContainText("No");
  await expect(table.getByRole("row", { name: new RegExp(sellerEmail) })).toContainText("Setting up");
  await expect(table.getByRole("row", { name: new RegExp(sellerEmail) })).toContainText("Listed Lessons (not public)");
  await expect(table.getByRole("row", { name: new RegExp(staffEmail) })).toContainText("Admin");

  await page.getByRole("link", { name: /^Sellers \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/show=sellers/);
  await expect(table.getByRole("row", { name: new RegExp(sellerEmail) })).toBeVisible();
  await expect(table.getByRole("row", { name: new RegExp(buyerEmail) })).toHaveCount(0);

  await page.getByRole("link", { name: /^Everyone \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/\/admin\/accounts$/);
  await page.getByLabel("Search accounts").fill(buyerEmail);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("row", { name: new RegExp(buyerEmail) })).toBeVisible();
});
