import { expect, test } from "@playwright/test";

async function enterApp(page: import("@playwright/test").Page, options: { role?: "user" | "admin" } = {}) {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.route("**/api/client-config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      url: "https://acceptance.supabase.co",
      key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature",
    }),
  }));
  await page.route("**/api/demo/cards**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { id?: number };
      await route.fulfill({ json: { data: fixturePost(Number(body.id) || 1) } });
      return;
    }
    const url = new URL(request.url());
    const data = url.searchParams.get("mode") === "discover"
      ? Array.from({ length: 24 }, (_, index) => fixturePost(index + 1))
      : Array.from({ length: 24 }, (_, index) => ({ id: index + 1 }));
    await route.fulfill({ json: { data } });
  });
  await page.route("**/api/v1/topics**", (route) => route.fulfill({ json: { data: [
    { id: 1, name: "生活", description: "关注日常里的细节。", postCount: 1, participantCount: 1 },
  ] } }));
  await page.route("**/api/v1/topics/1**", (route) => route.fulfill({ json: { data: {
    topic: { id: 1, name: "生活", description: "关注日常里的细节。", postCount: 1, participantCount: 1 },
    items: [fixturePost(1)], total: 1, page: 1, limit: 12,
  } } }));
  if (options.role) {
    const role = options.role;
    await page.addInitScript(() => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem("sb-acceptance-auth-token", JSON.stringify({
        access_token: "e30.eyJzdWIiOiJhY2NlcHRhbmNlLXVzZXIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig",
        token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
        refresh_token: "acceptance-refresh", user: { id: "acceptance-user", aud: "authenticated", role: "authenticated", email: "acceptance@example.test", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: new Date().toISOString() },
      }));
    });
    await page.route("https://acceptance.supabase.co/auth/v1/user**", (route) => route.fulfill({ json: {
      id: "acceptance-user", aud: "authenticated", role: "authenticated", email: "acceptance@example.test",
      app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-11-01T00:00:00.000Z",
    } }));
    await page.route("**/api/v1/library-state", (route) => route.fulfill({ json: { data: {
      profile: { nickname: "验收用户", bio: "", avatar_url: null, role }, prefs: null,
      bookmarks: [], interactions: [], interests: [], own: [],
    } } }));
    await page.route("**/api/v1/admin/reports**", (route) => route.fulfill({ json: { data: { items: [], total: 0 } } }));
    await page.route("**/api/v1/admin/posts**", (route) => route.fulfill({ json: { data: { items: [], total: 0 } } }));
    await page.route("**/api/v1/admin/users**", (route) => route.fulfill({ json: { data: { items: [], total: 0 } } }));
    await page.route("**/api/v1/admin/message-reports**", (route) => route.fulfill({ json: { data: [] } }));
  }
  await page.goto("/");
  const skip = page.getByRole("button", { name: /先随便看看/ });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect.poll(async () => (await skip.isVisible().catch(() => false)) || await navigation.isVisible().catch(() => false)).toBeTruthy();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(navigation).toBeVisible();
}

async function setDiscoverLayout(page: import("@playwright/test").Page, layout: "单列阅读" | "瀑布流") {
  await page.locator(".bottom-nav").getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: /个人设置/ }).click();
  await page.getByRole("button", { name: /发现页布局/ }).click();
  await page.getByRole("radio", { name: new RegExp(layout) }).click();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.getByRole("button", { name: "返回，当前页面：我的" }).click();
}

function fixturePost(id: number) {
  return {
    id, cloudId: `cloud-post-${id}`, status: "published", tag: "生活", topics: ["生活"], title: `浏览器验收内容 ${id}`,
    body: "用于本地浏览器验收的内容正文。", cover: "安静观察日常",
    author: "验收账号", date: "2026-11-01",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Crect width='640' height='420' fill='%233a4a50'/%3E%3C/svg%3E",
    images: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Crect width='640' height='420' fill='%233a4a50'/%3E%3C/svg%3E"],
    isDemo: true,
  };
}

test("warm and dark theme tokens render without horizontal overflow from 320px to wide desktop", async ({ page }) => {
  for (const width of [320, 360, 375, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await enterApp(page);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }

  await page.evaluate(() => localStorage.setItem("heika-theme", "light"));
  await page.reload();
  await enterApp(page);
  await expect.poll(() => page.locator(":root").getAttribute("data-theme")).toBe("light");
  const light = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(light).toBe("#f6f5f1");

  await page.evaluate(() => localStorage.setItem("heika-theme", "dark"));
  await page.reload();
  await enterApp(page);
  await expect.poll(() => page.locator(":root").getAttribute("data-theme")).toBe("dark");
  const dark = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(dark).toBe("#0D0F12");

  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.setItem("heika-theme", "system"));
  await page.reload();
  await enterApp(page);
  await expect.poll(() => page.locator(":root").getAttribute("data-theme")).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => page.locator(":root").getAttribute("data-theme")).toBe("dark");
});

test("today waterfall hides content before reveal, keeps card geometry, and enforces five reveals", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await enterApp(page);
  await page.getByRole("button", { name: "首页" }).click();
  const cards = page.locator(".candidate-feed-card");
  await expect(cards.first()).toBeVisible();
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(6);

  const first = cards.nth(0);
  const firstCardId = await first.getAttribute("data-card-id");
  await expect(first.locator(".card-back-copy strong")).toHaveText("");
  const before = await first.boundingBox();
  await first.click();
  await expect(page.getByRole("button", { name: "确认翻开" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "今日已翻开 0 / 5 张" })).toBeVisible();
  await page.getByRole("button", { name: "确认翻开" }).click();
  await expect(page.locator(".flip-window-revealed h2")).toHaveText("浏览器验收内容 " + firstCardId);
  await page.locator(".flip-close").click({ timeout: 10_000 });
  await expect(first).toHaveClass(/is-unlocked/);
  await expect(first.locator(".card-back-copy strong")).not.toHaveText("");
  const after = await first.boundingBox();
  expect(Math.abs((before?.width ?? 0) - (after?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((before?.height ?? 0) - (after?.height ?? 0))).toBeLessThanOrEqual(1);

  for (let index = 1; index < 5; index++) {
    const card = cards.nth(index);
    const cardId = await card.getAttribute("data-card-id");
    await card.click();
    await page.getByRole("button", { name: "确认翻开" }).click();
    await expect(page.locator(".flip-window-revealed h2")).toHaveText(`浏览器验收内容 ${cardId}`);
    await page.locator(".flip-close").click({ timeout: 10_000 });
    await expect(card).toHaveClass(/is-unlocked/);
  }
  await expect(page.locator(".daily-quota-summary strong")).toHaveText("今日已翻开 5 / 5 张");
  await cards.nth(5).click();
  await expect(cards.nth(5)).not.toHaveClass(/is-unlocked/);

  await first.scrollIntoViewIfNeeded();
  const beforeDetailScroll = await page.evaluate(() => window.scrollY);
  await first.click();
  await expect(page.locator(".flip-window-revealed h2")).toBeVisible();
  await page.getByRole("button", { name: "查看更多" }).click();
  await expect(page.locator(".detail")).toBeVisible();
  const detailImage = page.locator(".detail-image-button img");
  await expect(detailImage).toBeVisible();
  await expect.poll(() => detailImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.locator(".flip-overlay")).toHaveCount(0);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - beforeDetailScroll)).toBeLessThanOrEqual(2);
});

test("discovery, image detail, and publish composer remain responsive with soft keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await enterApp(page);
  await setDiscoverLayout(page, "单列阅读");
  await page.locator(".bottom-nav").getByRole("button", { name: "发现" }).click();
  await expect.poll(() => page.locator(".editorial-feed").evaluate((feed) => getComputedStyle(feed).columnCount)).toBe("1");
  await setDiscoverLayout(page, "瀑布流");
  await page.locator(".bottom-nav").getByRole("button", { name: "发现" }).click();
  await expect.poll(() => page.locator(".editorial-feed").evaluate((feed) => getComputedStyle(feed).columnCount)).toBe("2");
  await expect(page.locator(".editorial-feed .post-card").first()).toBeVisible();
  await page.locator(".editorial-feed .post-card").first().click();
  await expect(page.locator(".detail")).toBeVisible();
  await expect(page.locator(".detail-header")).toBeVisible();
  await expect(page.locator(".detail-more-button")).toBeVisible();
  await page.locator(".detail-more-button").click();
  await expect(page.getByRole("button", { name: "不感兴趣" })).toBeVisible();
  await page.locator(".detail-topic-list").getByRole("button", { name: "#生活" }).click();
  await expect(page.locator(".topic-detail-page h1")).toHaveText("#生活");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#0D0F12");
  await page.getByRole("button", { name: "返回，当前页面：发现" }).click();
  await expect(page.locator(".detail")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "发布内容" }).click();
  await expect(page.getByText("分享一篇内容", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "标题" }).fill("浏览器验收草稿");
  await page.getByRole("textbox", { name: "正文" }).focus();
  await expect(page.getByRole("textbox", { name: "正文" })).toBeFocused();
  await expect(page.getByRole("region", { name: "选择话题" })).toBeVisible();
});

test("report sheet and admin queue use the same theme tokens for signed-in accounts", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await enterApp(page, { role: "admin" });
  await page.getByRole("button", { name: "发现" }).click();
  await page.locator(".editorial-feed .post-card").first().click();
  await page.locator(".detail-more-button").click();
  await page.getByRole("button", { name: "举报内容" }).click();
  await expect(page.getByRole("heading", { name: "举报内容" })).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#0D0F12");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "返回" }).click();

  await page.evaluate(() => localStorage.setItem("heika-theme", "light"));
  await page.reload();
  await enterApp(page, { role: "admin" });
  await expect.poll(() => page.locator(":root").getAttribute("data-theme")).toBe("light");
  await page.getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: /举报与内容审核/ }).click();
  await expect(page.getByRole("heading", { name: "管理后台" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("当前没有符合条件的举报。" )).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#f6f5f1");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
