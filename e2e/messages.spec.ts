import { type Browser, expect, test } from "@playwright/test";
import { createLiveListing, serviceRest, signIn, uniqueEmail, userIdFor } from "./helpers";

// Buyer and seller chat, and the GuroMart helper. The helper runs against the
// local Anthropic stand-in (e2e/anthropic-stand-in.mjs), never the real API.
const ANTHROPIC_STAND_IN = process.env.E2E_ANTHROPIC_STAND_IN ?? "http://127.0.0.1:4011";

test.describe.configure({ mode: "serial" });

async function newPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

test("a teacher messages a seller, the seller replies, and a report reaches staff", async ({ page, browser, baseURL }) => {
  const listing = await createLiveListing("Chat Test Reading Lesson Plan", 7000);
  const email = uniqueEmail("asker");
  const reason = `Asked me to pay by GCash directly (${Date.now()})`;

  // Visitors are sent to sign in first, then straight into the chat.
  await page.goto(`/resources/${listing.slug}`);
  await page.getByRole("button", { name: "Message the seller" }).click();
  await page.waitForURL(/\/sign-in/);
  await signIn(page, email, `/resources/${listing.slug}`);
  await page.getByRole("button", { name: "Message the seller" }).click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  const chatUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Chat Test Reading Lesson Plan").first()).toBeVisible();

  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill("Hello po! Is this for Grade 3?");
  await box.press("Enter");
  await expect(page.getByTestId("messages")).toContainText("Hello po! Is this for Grade 3?");
  await expect(box).toHaveValue("");

  // The seller gets one notice and sees the teacher's first name only.
  const seller = await newPage(browser, baseURL);
  await signIn(seller, listing.sellerEmail, "/messages");
  await expect(seller.getByTestId("conversation")).toHaveCount(1);
  await expect(seller.getByTestId("conversation")).toContainText("Hello po! Is this for Grade 3?");
  await seller.goto("/notifications");
  await seller.getByRole("button", { name: /New message from a teacher/ }).click();
  await seller.waitForURL(`**${chatUrl}`);
  const reply = seller.getByRole("textbox", { name: "Message" });
  await reply.fill("Yes, it is for Grade 3.\nIt has an answer key too.");
  await seller.getByRole("button", { name: "Send" }).click();
  await expect(seller.getByTestId("messages")).toContainText("It has an answer key too.");
  await seller.goto("/notifications");
  await expect(seller.getByText("All caught up")).toBeVisible();

  // The teacher sees the reply, and an unread mark in their list until they open it.
  await page.goto("/messages");
  await expect(page.getByTestId("conversation")).toContainText("Buying Test Shop");
  await expect(page.getByTestId("conversation").getByTestId("unread-dot")).toBeVisible();
  await page.getByTestId("conversation").click();
  await expect(page.getByTestId("messages")).toContainText("Yes, it is for Grade 3.");
  await page.goto("/messages");
  await expect(page.getByTestId("conversation").getByTestId("unread-dot")).toHaveCount(0);

  // Staff can't open a chat nobody reported.
  const staffEmail = uniqueEmail("chatstaff");
  const staff = await newPage(browser, baseURL);
  await signIn(staff, staffEmail, "/account");
  await serviceRest("user_roles", { method: "POST", body: JSON.stringify({ user_id: await userIdFor(staffEmail), role: "admin" }) });
  await staff.goto(chatUrl);
  await expect(staff.getByTestId("messages")).toHaveCount(0);

  // The teacher reports it; staff can then read it and close the report.
  await page.goto(chatUrl);
  await page.getByRole("button", { name: "Report this chat" }).click();
  await page.getByRole("textbox", { name: "What happened?" }).fill(reason);
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("This chat was reported. GuroMart staff will review it.")).toBeVisible();

  await staff.goto("/admin/messages");
  await staff.getByRole("link").filter({ hasText: reason }).click();
  await staff.waitForURL(`**${chatUrl}`);
  await expect(staff.getByTestId("messages")).toContainText("It has an answer key too.");
  await expect(staff.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  await staff.getByRole("button", { name: "Close the report" }).click();
  await staff.waitForURL("**/admin/messages");
  await staff.goto(chatUrl);
  await expect(staff.getByTestId("messages")).toHaveCount(0);

  // A seller can't open a chat with their own shop.
  await seller.goto(`/resources/${listing.slug}`);
  await expect(seller.getByRole("button", { name: "Message the seller" })).toHaveCount(0);
});

test("the GuroMart helper answers, suggests real resources and stops at the daily limit", async ({ page }) => {
  const listing = await createLiveListing("Helper Test Fractions Worksheet", 4500);
  await serviceRest("platform_settings?key=eq.assistant.daily_limit", { method: "PATCH", body: JSON.stringify({ value: 3 }) });
  try {
    await page.goto("/help");
    await page.waitForURL(/\/sign-in\?next=%2Fhelp/);
    await signIn(page, uniqueEmail("helper"), "/help");
    await expect(page.getByTestId("helper-left")).toContainText("3 questions left today");

    // A starter question; the answer carries the live fee and links to site pages.
    await page.getByRole("button", { name: "How much does GuroMart keep when I sell?" }).click();
    const chat = page.getByTestId("helper-chat");
    await expect(chat.locator('[data-role="assistant"]')).toContainText("Sellers keep 90%");
    await expect(chat.getByRole("link", { name: "Refund policy" })).toHaveAttribute("href", "/refunds");
    await expect(page.getByTestId("helper-left")).toContainText("2 questions left today");

    const last = (await (await fetch(`${ANTHROPIC_STAND_IN}/last-request`)).json()) as {
      headers: Record<string, string>;
      body: { model: string; fallbacks: string; output_config: { effort: string }; system: { text: string; cache_control: object }[] };
    };
    expect(last.body.model).toBe("claude-opus-5-5");
    expect(last.body.fallbacks).toBe("default");
    expect(last.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(last.body.output_config.effort).toBe("low");
    expect(last.body.system[0].cache_control).toEqual({ type: "ephemeral" });

    // Asking for a resource runs the catalog search; the suggestion links to the real listing.
    const box = page.getByRole("textbox", { name: "Your question" });
    await box.fill("Can you find me a fractions worksheet?");
    await box.press("Enter");
    await expect(chat.locator('[data-role="assistant"]').nth(1)).toContainText("Helper Test Fractions Worksheet");
    await expect(chat.getByRole("link", { name: "View resource" })).toHaveAttribute("href", `/resources/${listing.slug}`);
    await chat.getByRole("link", { name: "View resource" }).click();
    await page.waitForURL(`**/resources/${listing.slug}`);

    // A declined question shows a message and gives the question back.
    await page.goto("/help");
    await expect(page.getByTestId("helper-left")).toContainText("1 question left today");
    await box.fill("Please refuse this");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByText("The helper can't answer that one.")).toBeVisible();
    await expect(box).toHaveValue("Please refuse this");
    await expect(page.getByTestId("helper-left")).toContainText("You've used today's questions.");
    await expect(box).toBeDisabled();
  } finally {
    await serviceRest("platform_settings?key=eq.assistant.daily_limit", { method: "PATCH", body: JSON.stringify({ value: 30 }) });
  }
});

test("the floating Ask GuroMart button opens the helper on any page", async ({ page }) => {
  // Visitors are asked to sign in before asking the helper.
  await page.goto("/browse");
  await page.getByTestId("chat-launcher").click();
  const panel = page.getByRole("dialog", { name: "Ask GuroMart" });
  await expect(panel.getByText("Sign in to ask the GuroMart helper your own question.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await signIn(page, uniqueEmail("launcher"), "/browse");
  await page.getByTestId("chat-launcher").click();
  await panel.getByRole("button", { name: "How do refunds work?" }).click();
  await expect(panel.locator('[data-role="assistant"]')).toContainText('Stand-in answer to "How do refunds work?"');
  // A link in the answer goes to the page and closes the panel.
  await panel.getByRole("link", { name: "Refund policy" }).click();
  await page.waitForURL("**/refunds");
  await expect(panel).toHaveCount(0);

  // The full helper page has its own chat box, so the button stays out of the way there.
  await page.goto("/help");
  await expect(page.getByTestId("helper-chat")).toBeVisible();
  await expect(page.getByTestId("chat-launcher")).toHaveCount(0);
});
