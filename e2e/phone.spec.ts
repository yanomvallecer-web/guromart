import { type Page, devices, expect, test } from "@playwright/test";
import { createLiveListing, latestCode, serviceRest, uniqueEmail } from "./helpers";

// The phone layout at a 390px-wide screen, the size of most budget Android phones.
test.use({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

/**
 * A phone on slow data before the app's JavaScript has arrived: the page's
 * HTML (including the small inline scripts that reveal streamed sections)
 * works, but React hasn't started. Pages must already be usable then.
 */
async function beforeJavaScriptLoads(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });
  await context.route(/\/_next\/static\/.*\.js(\?|$)/, (route) => route.abort());
  return context;
}

const resultCount = async (page: Page) => Number((await page.getByText(/^\d+ resources?$/).textContent())!.split(" ")[0]);

test("filters open in a bottom sheet with the real result count, and stay in the URL", async ({ page }) => {
  const listing = await createLiveListing(`Phone Filter Sheet Worksheet ${Date.now()}`, 0);
  const [grade] = await serviceRest("grade_levels?code=eq.grade-3&select=id");
  await serviceRest("product_grade_levels", { method: "POST", body: JSON.stringify({ product_id: listing.productId, grade_level_id: grade.id }) });

  await page.goto("/browse");
  // Results come first; the desktop sidebar isn't shown on phones.
  await expect(page.getByRole("heading", { name: "All teaching resources" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply filters" })).toBeHidden();
  const all = await resultCount(page);

  const trigger = page.getByRole("link", { name: "Filters" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: `Show ${all} ${all === 1 ? "resource" : "resources"}` })).toBeVisible();

  // Escape closes it and focus goes back to the button.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  // So does tapping the backdrop above the sheet.
  await trigger.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(195, 20);
  await expect(sheet).toBeHidden();

  // Choosing chips updates the count from the same search the page runs.
  await trigger.click();
  // Chips are labels around visually hidden radio buttons: tap the chip.
  const chip = (name: string) => sheet.locator("label").filter({ has: page.getByRole("radio", { name, exact: true }) });
  await chip("Grade 3").click();
  await chip("Worksheets").click();
  await expect(sheet.getByRole("radio", { name: "Grade 3" })).toBeChecked();
  const show = sheet.getByRole("button", { name: /^Show \d+ resources?$/ });
  await expect(show).toBeVisible();
  const counted = Number((await show.textContent())!.match(/\d+/)![0]);
  expect(counted).toBeGreaterThanOrEqual(1);
  await show.click();
  await expect(page).toHaveURL(/\/browse\?grade=grade-3&category=worksheet$/);
  await expect(sheet).toBeHidden();
  expect(await resultCount(page)).toBe(counted);
  await expect(page.getByRole("link", { name: /Phone Filter Sheet Worksheet/ }).first()).toBeVisible();

  // Filters in use are removable chips.
  await page.getByRole("link", { name: "Remove filter: Grade 3" }).click();
  await expect(page).toHaveURL(/\/browse\?category=worksheet$/);
  await expect(page.getByRole("link", { name: "Filters · 1" })).toBeVisible();

  // Sort is a one-line menu of links.
  const sortMenu = page.locator("summary").filter({ hasText: "Sort:" });
  await sortMenu.click();
  await page.getByRole("link", { name: "Price: low to high" }).click();
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(sortMenu).toContainText("Price: low to high");
  await expect(page.getByRole("link", { name: "Newest" })).toBeHidden();
});

test("filters work before JavaScript loads", async ({ browser }) => {
  const context = await beforeJavaScriptLoads(browser);
  const page = await context.newPage();
  await page.goto("/browse");
  await page.getByRole("link", { name: "Filters" }).click();
  await expect(page).toHaveURL(/#filters$/);
  const sheet = page.locator("#filters");
  await expect(sheet).toBeVisible();
  await sheet.getByText("Worksheets", { exact: true }).click();
  await sheet.getByRole("button", { name: "Show resources" }).click();
  await expect(page).toHaveURL(/category=worksheet/);
  await expect(page.getByRole("link", { name: "Remove filter: Worksheets" })).toBeVisible();
  await context.close();
});

test("the tab bar marks the current tab and sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs).toBeVisible();
  for (const name of ["Home", "Browse", "Library", "Cart", "Account"]) {
    const box = (await tabs.getByRole("link", { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  // The bar sits at the bottom of the screen and the page is padded so it covers nothing.
  expect((await tabs.boundingBox())!.y + (await tabs.boundingBox())!.height).toBeCloseTo(844, 0);
  const padding = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
  expect(padding).toBeGreaterThanOrEqual((await tabs.boundingBox())!.height - 1);

  // One header row: logo and search, no second search in the hero.
  await expect(page.getByRole("search")).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toHaveAttribute("placeholder", "Search lesson plans, DLL…");

  await tabs.getByRole("link", { name: "Browse" }).click();
  await expect(page).toHaveURL(/\/browse$/);
  await expect(tabs.getByRole("link", { name: "Browse" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Flibrary$/);
  await page.goto("/");
  await tabs.getByRole("link", { name: "Cart" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcart$/);
});

test("sign-in uses six code boxes that accept a pasted code", async ({ page }) => {
  const email = uniqueEmail("phone-paste");
  await page.goto("/sign-in?next=%2Flibrary");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const boxes = page.getByRole("group", { name: "Code from your email" }).getByRole("textbox");
  await expect(boxes).toHaveCount(6);
  await expect(boxes.first()).toHaveAttribute("autocomplete", "one-time-code");
  await expect(boxes.first()).toHaveAttribute("inputmode", "numeric");
  await expect(page.getByRole("link", { name: /Open Gmail/ })).toHaveAttribute("href", "https://mail.google.com");
  await expect(page.getByText("Check your Spam or Promotions folder")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send a new code in 0:\d\d/ })).toBeDisabled();

  // "Use a different email" goes back with the address filled in.
  await page.getByRole("link", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  // The local auth server allows one email per address per second (hosted Supabase: about a minute).
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // A wrong code typed digit by digit submits itself on the last digit and is refused.
  await boxes.first().click();
  await page.keyboard.type("000000");
  await expect(page.getByText("That code is wrong or has expired")).toBeVisible();
  await expect(boxes.first()).toHaveValue("");

  // Pasting the real code fills every box and signs in.
  const code = await latestCode(email);
  await boxes.first().focus();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, `Your code: ${code}`);
  await page.waitForURL("**/library");
  await expect(page.getByRole("heading", { name: "My library" })).toBeVisible();
});

test("sign-in works before JavaScript loads", async ({ browser }) => {
  const context = await beforeJavaScriptLoads(browser);
  const page = await context.newPage();
  const email = uniqueEmail("phone-nojs");
  await page.goto("/sign-in?next=%2Faccount");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Code from your email").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code is wrong or has expired")).toBeVisible();
  await page.getByLabel("Code from your email").fill(await latestCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/account");
  await context.close();
});

test("the resource page puts the price and buy button in a bar at the bottom", async ({ page }) => {
  const listing = await createLiveListing("Phone Buy Bar Test Exam", 9900);
  await page.goto(`/resources/${listing.slug}`);
  await expect(page.getByRole("heading", { name: "Phone Buy Bar Test Exam" })).toBeVisible();

  const bar = page.getByTestId("buy-bar");
  await expect(bar).toContainText("₱99.00");
  await expect(bar).toContainText("GCash · Maya · Card");
  await expect(bar.getByRole("link", { name: "Sign in to buy" })).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(844, 0);
  // The tab bar steps aside for it, and it stays put while scrolling.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await page.mouse.wheel(0, 2000);
  expect((await bar.boundingBox())!.y).toBeCloseTo(box.y, 0);
  // The title comes before the previews.
  await page.mouse.wheel(0, -4000);
  const titleY = (await page.getByRole("heading", { name: "Phone Buy Bar Test Exam" }).boundingBox())!.y;
  expect(titleY).toBeLessThan((await page.getByRole("region", { name: "Previews" }).boundingBox())!.y);
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();

  await bar.getByRole("link", { name: "Sign in to buy" }).click();
  await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=%2Fresources%2F${listing.slug}`));
});
