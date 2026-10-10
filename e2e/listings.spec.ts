import { expect, test } from "@playwright/test";
import { serviceRest, signIn, storedObjects, uniqueEmail, userIdFor } from "./helpers";

/** The listing form is in steps (file, details, price); this opens one. */
async function openStep(page: import("@playwright/test").Page, step: "File" | "Details" | "Price") {
  await page.getByRole("navigation", { name: "Listing steps" }).getByRole("button", { name: new RegExp(step) }).click();
  await expect(page.getByRole("navigation", { name: "Listing steps" }).getByRole("button", { name: new RegExp(step) })).toHaveAttribute("aria-current", "step");
}

/** Chips are labels around visually hidden inputs: tap the chip, as a teacher would. */
async function tapChip(page: import("@playwright/test").Page, role: "checkbox" | "radio", name: string) {
  await page.locator("label").filter({ has: page.getByRole(role, { name, exact: true }) }).click();
  await expect(page.getByRole(role, { name, exact: true })).toBeChecked();
}

// Locators use roles, not labels: the router keeps earlier pages mounted but hidden, and label lookups would find them.
// A minimal valid PDF and a 1x1 PNG, generated in the test so no binary fixtures live in the repo.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });

test("a seller drafts a resource, uploads files securely and submits it for review", async ({ page }) => {
  const email = uniqueEmail("lister");
  await signIn(page, email, "/sell");
  await page.getByText("Teacher", { exact: true }).click();
  await page.getByLabel("Shop name").fill("Upload Test Shop");
  await page.getByLabel("Shop address").fill(`upload-${Date.now()}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my shop" }).click();
  await page.waitForURL("**/seller");

  await page.getByRole("link", { name: "Add a resource" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Grade 4 Science Quarter 1 Worksheets");
  await page.getByRole("combobox", { name: "Resource type" }).selectOption({ label: "Worksheets" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/seller\/products\/[0-9a-f-]{36}$/);
  const productId = page.url().split("/").pop()!;
  await expect(page.getByTestId("listing-status")).toHaveText("Draft");
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  // A new draft starts on the file step.
  await expect(page.getByText("Step 1 of 3: File")).toBeVisible();

  // Validation: a paid price under the ₱30 minimum is refused, even when saved
  // from another step, and the form opens the step with the problem.
  await openStep(page, "Price");
  await page.getByRole("textbox", { name: "Price in pesos" }).fill("20");
  await openStep(page, "Details");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Paid resources must cost at least ₱30. Use 0 for free.")).toBeVisible();
  await expect(page.getByText("Step 3 of 3: Price")).toBeVisible();

  await openStep(page, "Details");
  await page.getByRole("textbox", { name: "Description" }).fill("Twenty-four worksheets on living things and their environment, with answer keys for every page.");
  await tapChip(page, "radio", "Science");
  await tapChip(page, "checkbox", "Grade 4");
  await page.getByRole("button", { name: "Next: Price" }).click();
  await page.getByRole("textbox", { name: "Price in pesos" }).fill("75");
  await page.getByRole("checkbox", { name: /I made this resource/ }).check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await openStep(page, "File");

  // A text file renamed to .pdf is rejected after upload and deleted from storage.
  await page.locator("#upload-file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not really a pdf, just text pretending") });
  await expect(page.getByText(/fake\.pdf: This file's contents don't match its type/)).toBeVisible();

  // Wrong type for a preview is refused before upload.
  await page.locator("#upload-preview").setInputFiles({ name: "cover.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText("cover.pdf: Previews must be PNG, JPG or WebP images.")).toBeVisible();

  await page.locator("#upload-file").setInputFiles({ name: "Science Q1 Worksheets.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByTestId("file-list").getByText("Science Q1 Worksheets.pdf")).toBeVisible();
  await expect(page.getByTestId("file-list").getByText(/PDF · 1 KB · Waiting for safety check/)).toBeVisible();

  await page.locator("#upload-preview").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("preview-list").getByRole("img")).toBeVisible();

  // Storage holds exactly one resource file under the seller's own folder, and it is private.
  const userId = await userIdFor(email);
  const [account] = await serviceRest(`seller_accounts?user_id=eq.${userId}&select=id`);
  const files = await serviceRest(`product_files?product_id=eq.${productId}&select=storage_path,size_bytes,file_format`);
  expect(files).toHaveLength(1);
  expect(files[0].storage_path.startsWith(`${account.id}/${productId}/`)).toBe(true);
  expect(files[0].size_bytes).toBe(PDF.length);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const publicTry = await fetch(`${base}/storage/v1/object/public/product-files/${files[0].storage_path}`);
  expect(publicTry.ok).toBe(false);
  // The rejected fake PDF was deleted, so only the accepted file is in the bucket.
  expect(await storedObjects("product-files", `${account.id}/${productId}`)).toHaveLength(1);

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("In review");

  // Not visible to the public until staff approve it.
  const [product] = await serviceRest(`products?id=eq.${productId}&select=slug,status`);
  expect(product.status).toBe("pending_review");
  const anon = await page.context().browser()!.newContext();
  const visitor = await anon.newPage();
  await visitor.goto(`/resources/${product.slug}`);
  await expect(visitor.getByRole("heading", { name: "Grade 4 Science Quarter 1 Worksheets" })).toHaveCount(0);
  await anon.close();

  // Withdrawing returns it to a draft, and it shows in the seller's list.
  await page.getByRole("button", { name: "Withdraw to draft" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Draft");
  await page.goto("/seller/products");
  await expect(page.getByRole("link", { name: /Grade 4 Science Quarter 1 Worksheets/ })).toContainText("₱75.00");

  // Removing a file deletes it from the listing.
  await page.getByRole("link", { name: /Grade 4 Science Quarter 1 Worksheets/ }).click();
  // With its file uploaded, the listing now opens on the details step.
  await expect(page.getByText("Step 2 of 3: Details")).toBeVisible();
  await openStep(page, "File");
  await page.getByRole("button", { name: "Remove Science Q1 Worksheets.pdf" }).click();
  await expect(page.getByTestId("file-list")).toHaveCount(0);
  expect(await storedObjects("product-files", `${account.id}/${productId}`)).toHaveLength(0);
});

/** Opens a shop and submits a complete listing through the seller UI. Returns the listing id. */
async function submitListing(page: import("@playwright/test").Page, email: string, title: string) {
  await signIn(page, email, "/sell");
  await page.getByText("Teacher", { exact: true }).click();
  await page.getByLabel("Shop name").fill("Review Test Shop");
  await page.getByLabel("Shop address").fill(`review-${Date.now()}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my shop" }).click();
  await page.waitForURL("**/seller");
  await page.goto("/seller/products/new");
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("combobox", { name: "Resource type" }).selectOption({ label: "Worksheets" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/seller\/products\/[0-9a-f-]{36}$/);
  await openStep(page, "Details");
  await page.getByRole("textbox", { name: "Description" }).fill("Thirty mixed practice items on adding and subtracting fractions, with an answer key.");
  await tapChip(page, "radio", "Mathematics");
  await tapChip(page, "checkbox", "Grade 5");
  await openStep(page, "Price");
  await page.getByRole("textbox", { name: "Price in pesos" }).fill("60");
  await page.getByRole("checkbox", { name: /I made this resource/ }).check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await openStep(page, "File");
  await page.locator("#upload-file").setInputFiles({ name: "Fractions.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByTestId("file-list").getByText("Fractions.pdf")).toBeVisible();
  await page.locator("#upload-preview").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("preview-list").getByRole("img")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("In review");
  return page.url().split("/").pop()!;
}

test("staff check files, reject with a note, then approve a resubmitted listing", async ({ page, browser }) => {
  const title = `Fractions practice ${Date.now()}`;
  const productId = await submitListing(page, uniqueEmail("reviewed"), title);

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const staffEmail = uniqueEmail("staff");
  await signIn(staff, staffEmail, "/account");
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: await userIdFor(staffEmail), role: "admin" }) });

  await staff.goto("/admin/listings");
  await staff.getByRole("link", { name: new RegExp(title) }).click();
  await expect(staff.getByRole("button", { name: "Approve and publish" })).toBeDisabled();

  // Staff can download the private file for checking.
  const fileId = (await staff.getByTestId("review-files").getByRole("link").getAttribute("href"))!.split("/").pop();
  const download = await staff.request.get(`/admin/files/${fileId}`);
  expect(download.ok()).toBe(true);
  expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // Sellers and buyers can't use the staff download route.
  expect((await page.request.get(`/admin/files/${fileId}`, { maxRedirects: 0 })).status()).toBe(403);

  // Rejecting needs a real note, which the seller then sees.
  await staff.getByRole("button", { name: "Reject with note" }).click();
  await expect(staff.getByText("Tell the seller what to fix (at least 10 characters).")).toBeVisible();
  await staff.getByRole("textbox", { name: "Note to the seller" }).fill("Please add the answer key pages to the PDF.");
  await staff.getByRole("button", { name: "Reject with note" }).click();
  await staff.waitForURL("**/admin/listings");

  await page.reload();
  await expect(page.getByTestId("listing-status")).toHaveText("Needs changes");
  await expect(page.getByText("Please add the answer key pages to the PDF.")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("In review");

  // Approve after marking the file safe. The listing and the seller's shop go live.
  await staff.goto(`/admin/listings/${productId}`);
  await staff.getByRole("button", { name: "Mark Fractions.pdf safe" }).click();
  await expect(staff.getByText("Checked, safe")).toBeVisible();
  await staff.getByRole("button", { name: "Approve and publish" }).click();
  await staff.waitForURL("**/admin/listings");
  await expect(staff.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  await staffContext.close();

  const [product] = await serviceRest(`products?id=eq.${productId}&select=slug,status`);
  expect(product.status).toBe("published");
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/resources/${product.slug}`);
  await expect(visitor.getByRole("heading", { name: title })).toBeVisible();
  await expect(visitor.getByText("₱60.00")).toBeVisible();
  // Search finds it by relevance even with a typo in the query.
  await visitor.goto(`/browse?q=${encodeURIComponent(title.replace("Fractions", "Fractoins"))}`);
  await expect(visitor.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await visitorContext.close();

  await page.reload();
  await expect(page.getByTestId("listing-status")).toHaveText("Live");
});

test("uploading a PowerPoint adds its first slides as previews automatically", async ({ page }) => {
  const { createLiveListing } = await import("./helpers");
  const listing = await createLiveListing("Heat vs Temperature Slides", 9900);
  await serviceRest(`products?id=eq.${listing.productId}`, { method: "PATCH", body: JSON.stringify({ status: "draft" }) });
  await signIn(page, listing.sellerEmail, `/seller/products/${listing.productId}`);
  await openStep(page, "File");

  // A small sample deck (8 slides) kept in e2e/fixtures; the only binary fixture, since a deck can't be built inline.
  // One preview already exists, so the deck's first 5 slides fill the other 5 places, in order.
  await page.locator("#upload-file").setInputFiles("e2e/fixtures/sample-lesson.pptx");
  await expect(page.getByTestId("file-list").getByText("sample-lesson.pptx")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("preview-list").getByRole("img")).toHaveCount(6, { timeout: 30_000 });
  const rows = await serviceRest(`product_previews?product_id=eq.${listing.productId}&select=id,storage_path,sort_order&order=sort_order`);
  expect(rows.map((r: { sort_order: number }) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5]);
  await expect(page.getByTestId("slide-maker")).toBeHidden();

  // After removing two, one click refills them from the PowerPoint already on the listing.
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("preview-list").getByRole("button", { name: "Remove preview image" }).last().click();
    await expect(page.getByTestId("preview-list").getByRole("img")).toHaveCount(5 - i);
  }
  const maker = page.getByTestId("slide-maker");
  await expect(maker).toContainText("Add the first 2 slides");
  await maker.getByRole("button", { name: "Add slides from sample-lesson.pptx" }).click();
  await expect(page.getByTestId("preview-list").getByRole("img")).toHaveCount(6, { timeout: 30_000 });
});
