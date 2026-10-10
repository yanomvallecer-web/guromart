import { type Browser, expect, test } from "@playwright/test";
import { addLiveListing, createLiveListing, serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

// Saved resources, teaching preferences, following shops, verified-buyer
// reviews and lesson bundles. Bundle checkout runs against the local PayMongo
// stand-in, like checkout.spec.ts.
const STAND_IN = process.env.E2E_PAYMONGO_STAND_IN ?? "http://127.0.0.1:4010";

test.describe.configure({ mode: "serial" });

async function newPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

test("a teacher saves a resource and sets what they teach for Browse", async ({ page }) => {
  const listing = await createLiveListing("Saved Test Fractions Worksheet", 9000);
  const email = uniqueEmail("saver");

  // Visitors are sent to sign in first.
  await page.goto(`/resources/${listing.slug}`);
  await expect(page.getByRole("link", { name: "Save" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(`/resources/${listing.slug}`)}`);

  await signIn(page, email, `/resources/${listing.slug}`);
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto("/library");
  await page.getByRole("link", { name: "Saved (1)" }).click();
  await expect(page.getByRole("link", { name: /Saved Test Fractions Worksheet/ })).toBeVisible();

  // Removing it empties the list.
  await page.goto(`/resources/${listing.slug}`);
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await page.goto("/library?tab=saved");
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();

  // Without preferences Browse shows everything.
  await page.goto("/browse");
  await expect(page.getByTestId("pref-banner")).toHaveCount(0);

  await page.goto("/account");
  await page.getByRole("combobox", { name: "Grade you teach" }).selectOption({ label: "Grade 4" });
  await page.getByRole("combobox", { name: "Subject you teach" }).selectOption({ label: "Science" });
  await page.getByRole("button", { name: "Save what I teach" }).click();
  await expect(page.getByText("Saved. Browse now starts with resources for what you teach.")).toBeVisible();
  const userId = await userIdFor(email);
  const [prefs] = await serviceRest(`teaching_preferences?user_id=eq.${userId}&select=grade_levels(code),subjects(code)`);
  expect(prefs).toEqual({ grade_levels: { code: "grade-4" }, subjects: { code: "science" } });

  await page.goto("/browse");
  await expect(page.getByTestId("pref-banner")).toContainText("Showing Grade 4 · Science resources, based on what you teach.");
  // A search is never narrowed by preferences.
  await page.goto("/browse?q=fractions");
  await expect(page.getByTestId("pref-banner")).toHaveCount(0);
  await page.goto("/browse");
  await page.getByRole("link", { name: "Show all resources" }).click();
  await page.waitForURL("**/browse?all=1");
  await expect(page.getByTestId("pref-banner")).toHaveCount(0);
});

test("following a shop brings an in-app notice when it publishes", async ({ page }) => {
  const first = await createLiveListing("Follow Test First Worksheet", 6000);
  const email = uniqueEmail("follower");
  await signIn(page, email, `/shop/${first.storeSlug}`);
  await page.getByRole("button", { name: "Follow shop" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("follower-count")).toHaveText("1 follower");

  // The shop publishes something new.
  const next = await addLiveListing(first, "Follow Test New Assessment", 8000);

  await page.goto("/notifications");
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /New from Buying Test Shop.*Follow Test New Assessment/ })).toBeVisible();
  await page.locator("header details > summary").click();
  await expect(page.getByTestId("unread-count")).toHaveText("1");

  await page.getByRole("button", { name: /New from Buying Test Shop/ }).click();
  await page.waitForURL(`**/resources/${next.slug}`);
  await page.goto("/notifications");
  await expect(page.getByText("All caught up")).toBeVisible();

  // Unfollowing stops further notices.
  await page.goto(`/shop/${first.storeSlug}`);
  await page.getByRole("button", { name: "Following" }).click();
  await expect(page.getByRole("button", { name: "Follow shop" })).toBeVisible();
  await addLiveListing(first, "Follow Test After Unfollow", 8000);
  await page.goto("/notifications");
  await expect(page.getByText("All caught up")).toBeVisible();
});

test("only teachers with the resource can review it; sellers reply and staff can hide", async ({ page, browser }, testInfo) => {
  const free = await createLiveListing("Review Test Reading Passage", 0);
  const path = `/resources/${free.slug}`;
  const note = `My Grade 5 class finished it in one period (${Date.now()}).`;
  const email = uniqueEmail("reviewer");
  await signIn(page, email, path);
  await expect(page.getByText("Only teachers who have this resource in their library can review it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Post review" })).toHaveCount(0);

  const userId = await userIdFor(email);

  await page.getByRole("button", { name: "Get it free" }).click();
  await expect(page.getByRole("link", { name: "Open in library" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Rate this resource" })).toBeVisible();
  await page.locator("label", { hasText: "4 stars" }).click();
  await page.getByRole("textbox", { name: "What worked in your class? (optional)" }).fill(note);
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Thanks, your review is posted.")).toBeVisible();
  await page.reload();
  const reviews = page.getByTestId("reviews");
  await expect(reviews.getByRole("listitem").getByText(note)).toBeVisible();
  await expect(reviews.getByText("4.0 from 1 teacher")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible();

  // Still one review each: updating changes it in place.
  await page.locator("label", { hasText: "5 stars" }).click();
  await page.getByRole("button", { name: "Update review" }).click();
  await expect(page.getByText("Thanks, your review is posted.")).toBeVisible();
  const rows = await serviceRest(`reviews?product_id=eq.${free.productId}&select=rating,user_id`);
  expect(rows).toEqual([{ rating: 5, user_id: userId }]);

  // The seller replies publicly.
  const seller = await newPage(browser, testInfo.project.use.baseURL);
  await signIn(seller, free.sellerEmail, path);
  await seller.getByRole("button", { name: "Reply as the seller" }).click();
  await seller.getByRole("textbox", { name: "Your public reply" }).fill("Salamat! A Filipino version is coming.");
  await seller.getByRole("button", { name: "Save reply" }).click();
  await expect(seller.getByText("Reply from the seller")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("reviews").getByText("Salamat! A Filipino version is coming.")).toBeVisible();

  // Staff hide it: it leaves the page and the rating, and the author is told.
  const sellerId = await userIdFor(free.sellerEmail);
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: sellerId, role: "admin" }) });
  await seller.goto("/admin/reviews");
  const card = seller.locator("li").filter({ hasText: note });
  await card.getByRole("button", { name: "Hide" }).click();
  await expect(card.getByText("Hidden")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("reviews").getByText("No reviews yet.")).toBeVisible();
  await expect(page.getByText("GuroMart staff hid this review.")).toBeVisible();
  const [product] = await serviceRest(`products?id=eq.${free.productId}&select=rating_count`);
  expect(product.rating_count).toBe(0);
});

test("a seller bundles resources at one lower price and the buyer gets every resource after payment", async ({ page, browser }, testInfo) => {
  const a = await createLiveListing("Bundle Test Lesson Plan", 10000);
  const b = await addLiveListing(a, "Bundle Test Summative Assessment", 15000);

  const seller = await newPage(browser, testInfo.project.use.baseURL);
  await signIn(seller, a.sellerEmail, "/seller/bundles");
  await seller.getByRole("textbox", { name: "Bundle name" }).fill("Bundle Test Full Lesson");
  await seller.getByRole("button", { name: "Create bundle" }).click();
  await seller.waitForURL(/\/seller\/bundles\/[0-9a-f-]{36}$/);
  await seller.getByRole("textbox", { name: "Lesson topic" }).fill("Heat vs. Temperature");
  await seller.getByRole("checkbox", { name: /Bundle Test Lesson Plan/ }).check();
  await seller.getByRole("checkbox", { name: /Bundle Test Summative Assessment/ }).check();
  await expect(seller.getByTestId("bundle-separate")).toHaveText("2 chosen, ₱250.00 if bought separately");

  // A price that isn't lower than buying separately is refused at publish.
  await seller.getByRole("textbox", { name: "Bundle price (₱)" }).fill("260");
  await seller.getByRole("button", { name: "Save bundle" }).click();
  await expect(seller.getByText("Bundle saved.")).toBeVisible();
  await seller.getByRole("button", { name: "Publish bundle" }).click();
  await expect(seller.getByText(/must be less than the resources cost separately \(₱250\.00\)/)).toBeVisible();

  await seller.getByRole("textbox", { name: "Bundle price (₱)" }).fill("199");
  await seller.getByRole("button", { name: "Save bundle" }).click();
  await expect(seller.getByText("Bundle saved.")).toBeVisible();
  await seller.getByRole("button", { name: "Publish bundle" }).click();
  await expect(seller.getByRole("button", { name: "Unpublish to edit" })).toBeVisible();
  await seller.getByRole("link", { name: "View the bundle page" }).click();
  await seller.waitForURL((url) => url.pathname.startsWith("/bundles/"));
  const bundlePath = new URL(seller.url()).pathname;
  await expect(seller.getByText("You save ₱51.00.")).toBeVisible();

  // Each resource page points to the bundle.
  await page.goto(`/resources/${a.slug}`);
  await expect(page.getByTestId("bundle-links").getByRole("link", { name: "Heat vs. Temperature" })).toHaveAttribute("href", bundlePath);

  const email = uniqueEmail("bundlebuyer");
  await signIn(page, email, bundlePath);
  await expect(page.getByRole("heading", { level: 1, name: "Heat vs. Temperature" })).toBeVisible();
  await page.getByRole("button", { name: "Buy the bundle" }).click();
  await page.waitForURL(`${STAND_IN}/checkout/**`);
  await expect(page.getByText("Bundle: Bundle Test Full Lesson: ₱199.00")).toBeVisible();
  const orderNumber = (await page.getByText(/^Order GM-\d+/).textContent())!.match(/GM-\d+/)![0];

  // Nothing is unlocked until PayMongo confirms.
  expect((await page.request.get(`/library/download/${a.fileId}`, { maxRedirects: 0 })).status()).toBe(403);
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(`**/orders/${orderNumber}?from=checkout`);
  await expect(page.getByTestId("order-status")).toHaveText("Paid");

  await page.goto("/library");
  await expect(page.getByRole("link", { name: "Bundle Test Lesson Plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bundle Test Summative Assessment" })).toBeVisible();

  // The bundle price is split across the resources by their own prices; GuroMart keeps 10% of each.
  const buyerId = await userIdFor(email);
  const [order] = await serviceRest(
    `orders?user_id=eq.${buyerId}&select=total_centavos,status,order_items(product_id,unit_price_centavos,platform_fee_centavos,seller_earnings_centavos)`,
  );
  expect(order.status).toBe("paid");
  expect(order.total_centavos).toBe(19900);
  const byProduct = Object.fromEntries(order.order_items.map((i: { product_id: string }) => [i.product_id, i]));
  expect(byProduct[a.productId]).toMatchObject({ unit_price_centavos: 7960, platform_fee_centavos: 796, seller_earnings_centavos: 7164 });
  expect(byProduct[b.productId]).toMatchObject({ unit_price_centavos: 11940, platform_fee_centavos: 1194, seller_earnings_centavos: 10746 });

  // Already owning the resources, the buyer isn't offered the bundle again.
  await page.goto(bundlePath);
  await expect(page.getByRole("link", { name: "All of these are in your library" })).toBeVisible();
});
