import { expect, test } from "@playwright/test";

test("phone preview only allows same-origin iframe documents", async ({ request }) => {
  for (const site of [undefined, "cross-site", "same-site"]) {
    const response = await request.get("/browse?all=1", { headers: {
      ...(site ? { "sec-fetch-site": site } : {}), "sec-fetch-dest": "iframe",
    } });
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  }
  const sameOrigin = await request.get("/browse?all=1", {headers: {"sec-fetch-site":"same-origin", "sec-fetch-dest":"iframe"}});
  expect(sameOrigin.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(sameOrigin.headers()["content-security-policy"]).toBe("frame-ancestors 'self'");
  const viewer = await request.get("/app-preview.html", {headers: {"sec-fetch-site":"same-origin", "sec-fetch-dest":"iframe"}});
  expect(viewer.headers()["x-frame-options"]).toBe("DENY");
  expect(viewer.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
});

test("signed-out landing fits phones with readable full grade labels and separated headings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", {name:"Available grades and subjects",exact:true})).toBeVisible();
  for (const width of [320, 360, 393, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.locator("[data-guest-heading]").evaluateAll(rows => rows.every(row => {
      const title=row.querySelector("h2")!.getBoundingClientRect();
      const link=row.querySelector("a")!.getBoundingClientRect();
      return title.right <= link.left + 1 || link.right <= title.left + 1 || title.bottom <= link.top + 1 || link.bottom <= title.top + 1;
    }))).toBe(true);
    await expect.poll(() => page.locator(".guest-facet-card").evaluateAll(cards => cards.length > 0 && cards.every(card => {
      const box=card.getBoundingClientRect();
      const label=card.querySelector(".guest-facet-label")!;
      const range=document.createRange();
      range.selectNodeContents(label);
      return [...range.getClientRects()].every(text => text.left >= box.left && text.right <= box.right && text.top >= box.top && text.bottom <= box.bottom);
    }))).toBe(true);
    await expect.poll(() => page.locator(".guest-hero-title").evaluate(el => {
      const nodes=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while(nodes.nextNode()) {
        if(!nodes.currentNode.textContent?.trim()) continue;
        const range=document.createRange(); range.selectNodeContents(nodes.currentNode);
        if([...range.getClientRects()].some(text=>text.left<0 || text.right>innerWidth)) return false;
      }
      return true;
    })).toBe(true);
  }
});

test("homepage leads with real resources, then grades and subjects that have some", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Everything you need to teach, all in one place." })).toBeVisible();
  // The hero states the catalog's real size, and the steps say how buying works.
  await expect(page.getByTestId("hero-counts")).toContainText(/\d+ resources?/);
  await expect(page.getByRole("region", { name: "How GuroMart works" }).getByRole("listitem")).toHaveCount(4);
  // Resources come right after the hero, with the rule that picked them.
  const featured = page.getByRole("region", { name: "Featured resources" });
  await expect(featured.getByText("The newest lesson bundles, then the most bought and downloaded resources.", { exact: false })).toBeVisible();
  expect(await featured.getByRole("listitem").count()).toBeGreaterThan(0);
  // Grades and subjects only appear with a live count, and lead to matching results.
  const grades = page.getByRole("region", { name: "Available grades and subjects" });
  await expect(grades.getByRole("link", { name: "Browse all resources" })).toHaveAttribute("href", "/browse");
  const first = grades.getByRole("listitem").getByRole("link").first();
  const shown = Number(await first.getByTestId("facet-count").textContent());
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
