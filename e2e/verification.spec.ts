import { expect, test } from "@playwright/test";
import { serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

// A 1x1 PNG standing in for a photo of an ID.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("a seller adds payout details and gets their ID verified after one rejection", async ({ page, browser }) => {
  const email = uniqueEmail("verify");
  await signIn(page, email, "/sell");
  await page.getByText("Teacher", { exact: true }).click();
  await page.getByRole("textbox", { name: "Shop name" }).fill("Verify Test Shop");
  await page.getByRole("textbox", { name: "Shop address" }).fill(`verify-${Date.now()}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Open my shop" }).click();
  await page.waitForURL("**/seller");
  await page.getByRole("link", { name: "Verify your identity" }).click();
  await page.waitForURL("**/seller/verify");
  await expect(page.getByTestId("verification-status")).toHaveText("Not verified");

  // Payout details: wallet numbers are checked, then saved and shown masked.
  await page.getByRole("textbox", { name: "Name on the account" }).fill("Liza Cruz");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("12345");
  await page.getByRole("button", { name: "Save payout details" }).click();
  await expect(page.getByText("Enter the 11-digit mobile number, like 0917 123 4567.")).toBeVisible();
  await page.getByRole("textbox", { name: "Name on the account" }).fill("Liza Cruz");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("0917 123 4567");
  await page.getByRole("button", { name: "Save payout details" }).click();
  await expect(page.getByText("Payout details saved.")).toBeVisible();
  await expect(page.getByTestId("payout-current")).toHaveText("Current: GCash · Liza Cruz · •••• 4567");

  // A file that isn't really an image is refused.
  await page.getByRole("combobox", { name: "Type of ID" }).selectOption("government_id");
  await page.locator("#id-file").setInputFiles({ name: "id.png", mimeType: "image/png", buffer: Buffer.from("plain text, not a picture") });
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText(/contents don't match its type/)).toBeVisible();

  await page.locator("#id-file").setInputFiles({ name: "id.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByTestId("verification-status")).toHaveText("In review");

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const staffEmail = uniqueEmail("idstaff");
  await signIn(staff, staffEmail, "/account");
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: await userIdFor(staffEmail), role: "admin" }) });

  await staff.goto("/admin/verifications");
  const request = staff.getByTestId("verification-request").filter({ hasText: "Verify Test Shop" }).last();
  await expect(request).toContainText("Payout account name: Liza Cruz");
  const docHref = (await request.getByRole("link", { name: "Open the document (logged)" }).getAttribute("href"))!;
  const doc = await staff.request.get(docHref);
  expect(doc.ok()).toBe(true);
  expect((await doc.body()).subarray(1, 4).toString()).toBe("PNG");
  expect((await page.request.get(docHref, { maxRedirects: 0 })).status()).toBe(403);

  await request.getByRole("textbox", { name: "Note to the seller" }).fill("The photo is too small to read. Please retake it.");
  await request.getByRole("button", { name: "Reject with note" }).click();
  await expect(staff.getByTestId("verification-request").filter({ hasText: "Verify Test Shop" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("verification-status")).toHaveText("Needs a new ID");
  await expect(page.getByText("The photo is too small to read. Please retake it.")).toBeVisible();
  await page.getByRole("combobox", { name: "Type of ID" }).selectOption("prc_license");
  await page.locator("#id-file").setInputFiles({ name: "prc.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByTestId("verification-status")).toHaveText("In review");

  await staff.reload();
  await staff.getByTestId("verification-request").filter({ hasText: "Verify Test Shop" }).getByRole("button", { name: "Verify" }).click();
  await expect(staff.getByTestId("verification-request").filter({ hasText: "Verify Test Shop" })).toHaveCount(0);
  await staffContext.close();

  await page.reload();
  await expect(page.getByTestId("verification-status")).toHaveText("Verified");
  await page.goto("/seller");
  await expect(page.getByText("4. Verify your identity")).toHaveClass(/line-through/);
  await expect(page.getByText("5. Add payout details")).toHaveClass(/line-through/);
});
