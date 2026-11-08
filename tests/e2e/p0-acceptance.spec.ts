import { expect, test } from "@playwright/test";

async function enterApp(page: import("@playwright/test").Page, options: { role?: "user" | "admin"; noImage?: boolean; failedImage?: boolean } = {}) {
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
      await route.fulfill({ json: { data: fixturePost(Number(body.id) || 1, !options.noImage, options.failedImage) } });
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
    await page.route("**/api/v1/admin/overview**", (route) => route.fulfill({ json: { data: { usersToday: 0, postsToday: 0, pending: 0, pendingReports: 0, aiResources: 0, views: 0, likes: 0, saves: 0, comments: 0 } } }));
  }
  await page.goto("/");
  const skip = page.getByRole("button", { name: /先随便看看/ });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect.poll(async () => (await skip.isVisible().catch(() => false)) || await navigation.isVisible().catch(() => false), { timeout: 15_000 }).toBeTruthy();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(navigation).toBeVisible();
}

async function setDiscoverLayout(page: import("@playwright/test").Page, layout: "单列阅读" | "瀑布流") {
  await page.locator(".bottom-nav").getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: /发现页布局/ }).click();
  await page.getByRole("radio", { name: new RegExp(layout) }).click();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.getByRole("button", { name: "返回，当前页面：我的" }).click();
}

async function chooseDetailTransition(page: import("@playwright/test").Page, option: "连续展开" | "柔和上浮" | "留影衔接") {
  await page.getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: /详情过渡效果/ }).click();
  await expect(page.getByRole("radiogroup", { name: "详情过渡效果" }).getByRole("radio")).toHaveCount(3);
  await page.getByRole("radio", { name: new RegExp(option) }).click();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("heika-detail-transition"))).toBe(
    option === "连续展开" ? "image-zoom" : option === "柔和上浮" ? "blur-rise" : "ghost-handoff",
  );
  await page.getByRole("button", { name: "返回，当前页面：我的" }).click();
}

function fixturePost(id: number, withImage = true, failedImage = false) {
  const images = [
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Crect width='640' height='420' fill='%233a4a50'/%3E%3C/svg%3E",
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Crect width='640' height='420' fill='%235c4d68'/%3E%3C/svg%3E",
  ];
  return {
    id, cloudId: `cloud-post-${id}`, status: "published", tag: "生活", topics: ["生活"], title: `浏览器验收内容 ${id}`,
    body: "用于本地浏览器验收的内容正文。", cover: "安静观察日常",
    author: "验收账号", authorId: "acceptance-author", authorAvatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23c9a54b'/%3E%3C/svg%3E", date: "2026-11-01", likeCount: 12,
    ...(withImage ? { image: failedImage ? "https://example.test/broken-cover.jpg" : images[0], images: failedImage ? ["https://example.test/broken-cover.jpg"] : images } : {}),
    isDemo: true,
  };
}

test("warm and dark theme tokens render without horizontal overflow from 320px to wide desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await enterApp(page);
  for (const width of [320, 360, 375, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
    const navigation = await page.locator(".bottom-nav-shell").boundingBox();
    expect(navigation, `missing navigation at ${width}px`).not.toBeNull();
    if (width >= 1200) {
      expect(navigation!.x, `desktop rail should start at the left edge at ${width}px`).toBe(0);
      expect(navigation!.width, `desktop rail width at ${width}px`).toBeCloseTo(220, 0);
      expect(navigation!.height, `desktop rail should fill the screen at ${width}px`).toBeGreaterThanOrEqual(844);
      expect((await page.locator(".app").boundingBox())!.x, `desktop content should clear the rail at ${width}px`).toBeGreaterThanOrEqual(220);
    } else if (width >= 768) {
      expect(navigation!.y, `tablet navigation should stay fixed at the bottom at ${width}px`).toBeGreaterThan(700);
      expect(navigation!.width, `tablet navigation should span the viewport at ${width}px`).toBeCloseTo(width, 0);
      expect(navigation!.x, `tablet navigation should align to the viewport at ${width}px`).toBe(0);
      const centers = await page.locator(".bottom-nav button").evaluateAll((buttons) => buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return box.left + box.width / 2;
      }));
      expect(centers).toHaveLength(4);
      const midpoint = navigation!.x + navigation!.width / 2;
      expect(Math.abs((centers[0] + centers[3]) / 2 - midpoint), `outer navigation items should balance at ${width}px`).toBeLessThanOrEqual(2);
      expect(Math.abs((centers[1] + centers[2]) / 2 - midpoint), `inner navigation items should balance at ${width}px`).toBeLessThanOrEqual(2);
      const compose = await page.locator(".bottom-nav-shell>.compose").boundingBox();
      expect(compose).not.toBeNull();
      expect(Math.abs(compose!.x + compose!.width / 2 - (navigation!.x + navigation!.width / 2)), `compose button should remain centered at ${width}px`).toBeLessThanOrEqual(2);
      for (const button of await page.locator(".bottom-nav button").all()) {
        const bounds = await button.boundingBox();
        const separated = bounds!.x + bounds!.width <= compose!.x - 2 || compose!.x + compose!.width <= bounds!.x - 2;
        expect(separated, `compose button should not cover a navigation target at ${width}px`).toBeTruthy();
      }
    } else {
      expect(navigation!.y, `tablet and phone navigation should stay at the bottom at ${width}px`).toBeGreaterThan(700);
      const expectedWidth = Math.min(520, width - 24);
      expect(navigation!.width, `floating navigation width at ${width}px`).toBeCloseTo(expectedWidth, 0);
      expect(navigation!.x, `floating navigation should be centered at ${width}px`).toBeCloseTo((width - expectedWidth) / 2, 0);
      expect(await page.locator(".bottom-nav button").count()).toBe(4);
      await expect(page.locator(".bottom-nav-shell>.compose svg")).toBeVisible();
    }
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

test("discovery columns, desktop detail and settings adapt at every requested breakpoint", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await enterApp(page);
  await page.getByRole("button", { name: "发现", exact: true }).click();
  await expect(page.locator(".stable-editorial-feed .post-card").first()).toBeVisible();

  for (const [width, expectedColumns] of [[375, 2], [430, 2], [768, 3], [1024, 3], [1280, 4], [1440, 4], [1920, 5]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator(".stable-editorial-feed").evaluate((feed) => getComputedStyle(feed).gridTemplateColumns.trim().split(/\s+/).length)).toBe(expectedColumns);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on discovery at ${width}px`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator(".stable-editorial-feed .post-card").first().click();
  await expect(page.locator(".detail")).toBeVisible();
  for (const [width, expectedColumns] of [[375, 1], [430, 1], [768, 1], [1024, 2], [1280, 2], [1440, 2], [1920, 2]] as const) {
    await page.setViewportSize({ width, height: 900 });
    const body = page.locator(".detail-body");
    const display = await body.evaluate((element) => getComputedStyle(element).display);
    const actualColumns = display === "grid"
      ? await body.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)
      : 1;
    expect(actualColumns, `detail columns at ${width}px`).toBe(expectedColumns);
    if (expectedColumns === 2) {
      await expect.poll(() => page.locator(".detail-comments").evaluate((comments) => getComputedStyle(comments).overflowY)).toBe("auto");
      const [articleBox, commentsBox] = await Promise.all([
        page.locator(".detail-article-column").boundingBox(),
        page.locator(".detail-comments").boundingBox(),
      ]);
      expect(articleBox, `article column missing at ${width}px`).not.toBeNull();
      expect(commentsBox, `comments column missing at ${width}px`).not.toBeNull();
      expect(articleBox!.x + articleBox!.width, `article and comments overlap at ${width}px`).toBeLessThanOrEqual(commentsBox!.x + 1);
    } else {
      const [articleBox, commentsBox] = await Promise.all([
        page.locator(".detail-article-column").boundingBox(),
        page.locator(".detail-comments").boundingBox(),
      ]);
      expect(articleBox, `article column missing at ${width}px`).not.toBeNull();
      expect(commentsBox, `comments column missing at ${width}px`).not.toBeNull();
      expect(commentsBox!.y, `comments should follow the article at ${width}px`).toBeGreaterThanOrEqual(articleBox!.y + articleBox!.height);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow in detail at ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "返回" }).click();

  await page.getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.locator(".settings-desktop-nav")).toBeVisible();
  await expect(page.locator(".settings-desktop-nav a")).toHaveCount(5);
  await page.locator(".settings-desktop-nav a[href='#settings-group-1']").click();
  await expect(page.locator("#settings-group-1")).toBeInViewport();

  await page.getByRole("button", { name: "发布内容", exact: true }).click();
  await expect(page.locator(".composer-modal")).toBeVisible();
  await expect.poll(() => page.locator(".composer-workspace").evaluate((workspace) => getComputedStyle(workspace).display)).toBe("block");
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
  const revealCard = page.locator(".flip-window-revealed");
  await expect(revealCard).not.toHaveClass(/is-rarity-reveal/);
  await expect(revealCard).toHaveClass(/has-image/);
  await expect(revealCard.locator(".window-quota")).toHaveCount(0);
  const [revealBox, imageBox] = await Promise.all([
    revealCard.boundingBox(),
    revealCard.locator(":scope > img").boundingBox(),
  ]);
  expect(revealBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  expect(imageBox!.height / revealBox!.height).toBeGreaterThanOrEqual(.64);
  expect(imageBox!.height / revealBox!.height).toBeLessThanOrEqual(.66);
  expect(await revealCard.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("15px");
  expect(await revealCard.locator(":scope > img").evaluate((image) => getComputedStyle(image).borderRadius)).toBe("0px");
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

test("text-only today reveal fills the card, omits image placeholders, and opens details", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await enterApp(page, { noImage: true });
  await page.getByRole("button", { name: "首页" }).click();
  const card = page.locator(".candidate-feed-card").first();
  await card.click();
  await page.getByRole("button", { name: "确认翻开" }).click();
  const reveal = page.locator(".flip-window-revealed");
  await expect(reveal).not.toHaveClass(/is-rarity-reveal/);
  await expect(reveal).toHaveClass(/no-image/);
  await expect(reveal.locator(":scope > img")).toHaveCount(0);
  await expect(reveal.locator(".flip-window-image-error,.flip-window-visual-fallback")).toHaveCount(0);
  await expect(reveal.locator(".window-more")).toHaveText("查看详情");
  await expect(reveal.locator(".window-quota")).toHaveCount(0);
  const [revealBox, copyBox] = await Promise.all([reveal.boundingBox(), reveal.locator(".window-reveal-copy").boundingBox()]);
  expect(revealBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(Math.abs(copyBox!.height - revealBox!.height)).toBeLessThanOrEqual(3);
  await reveal.locator(".window-more").click();
  await expect(page.locator(".detail")).toBeVisible();
});

test("failed reveal image stays in image layout and reports the load failure", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("https://example.test/broken-cover.jpg", (route) => route.abort());
  await enterApp(page, { failedImage: true });
  await page.getByRole("button", { name: "首页" }).click();
  await page.locator(".candidate-feed-card").first().click();
  await page.getByRole("button", { name: "确认翻开" }).click();
  const reveal = page.locator(".flip-window-revealed");
  await expect(reveal).not.toHaveClass(/is-rarity-reveal/);
  await expect(reveal).toHaveClass(/has-image/);
  await expect(reveal).not.toHaveClass(/no-image/);
  await expect(reveal.locator(".flip-window-image-error")).toBeVisible();
});

test("discovery, image detail, and publish composer remain responsive with soft keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await enterApp(page);
  await setDiscoverLayout(page, "单列阅读");
  await page.locator(".bottom-nav").getByRole("button", { name: "发现" }).click();
  await expect.poll(() => page.locator(".stable-editorial-feed").evaluate((feed) => getComputedStyle(feed).gridTemplateColumns.split(" ").length)).toBe(1);
  await setDiscoverLayout(page, "瀑布流");
  await page.locator(".bottom-nav").getByRole("button", { name: "发现" }).click();
  await expect.poll(() => page.locator(".stable-editorial-feed").evaluate((feed) => getComputedStyle(feed).gridTemplateColumns.split(" ").length)).toBe(2);
  await expect(page.locator(".stable-editorial-feed .post-card").first()).toBeVisible();
  await page.locator(".stable-editorial-feed .post-card").first().click();
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
  await expect(page.locator(".composer-modal")).toBeVisible();
  await page.getByRole("textbox", { name: "标题" }).fill("浏览器验收草稿");
  await page.getByRole("textbox", { name: "正文" }).focus();
  await expect(page.getByRole("textbox", { name: "正文" })).toBeFocused();
  await expect(page.getByRole("toolbar", { name: "Markdown 工具栏" })).toBeVisible();
  await page.getByRole("button", { name: /# 话题/ }).click();
  await expect(page.getByRole("dialog", { name: "选择话题" })).toBeVisible();
});

test("detail transition choices persist and animate image changes without blocking rapid navigation", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterApp(page);

  await chooseDetailTransition(page, "柔和上浮");
  await page.getByRole("button", { name: "发现", exact: true }).click();
  await page.locator(".stable-editorial-feed .post-card").first().click();
  await expect(page.locator(".detail-image-frame")).toHaveClass(/transition-blur-rise/);
  await page.getByRole("button", { name: "下一张图片" }).click();
  const image = page.locator(".detail-image-frame img.progressive-image-low").first();
  await expect.poll(() => image.getAttribute("src")).toContain("5c4d68");
  await expect.poll(() => image.evaluate((node) => getComputedStyle(node).animationName)).toBe("detail-image-enter-next");
  await page.getByRole("button", { name: "返回" }).click();

  await chooseDetailTransition(page, "留影衔接");
  await page.getByRole("button", { name: "发现", exact: true }).click();
  await page.locator(".stable-editorial-feed .post-card").first().click();
  await expect(page.locator(".detail-image-frame")).toHaveClass(/transition-ghost-handoff/);
  await page.getByRole("button", { name: "下一张图片" }).click();
  await expect(page.locator(".detail-image-frame img.progressive-image-low").first()).toHaveAttribute("src", /5c4d68/);
  await expect.poll(() => page.locator(".detail-image-frame img.progressive-image-low").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("detail-image-enter-next");
  await page.getByRole("button", { name: "上一张图片" }).click();
  await expect.poll(() => page.locator(".detail-image-frame img.progressive-image-low").first().getAttribute("src")).toContain("3a4a50");
  await expect(page.locator(".detail-gallery-controls")).toContainText("1 / 2");
  await page.getByRole("button", { name: "返回" }).click();

  await chooseDetailTransition(page, "连续展开");
  await page.getByRole("button", { name: "发现", exact: true }).click();
  await page.locator(".stable-editorial-feed .post-card").first().click();
  await expect(page.locator(".detail-image-frame")).toHaveClass(/transition-image-zoom/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("heika-detail-transition"))).toBe("image-zoom");
});

test("Glass Editorial discovery keeps live feed controls, media states, rating, likes and search", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const discoveryRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/demo/cards" && url.searchParams.get("mode") === "discover") discoveryRequests.push(url.search);
  });
  let failLikeUpdate = false;
  await page.route("**/api/v1/ratings**", (route) => route.fulfill({ json: { data: {} } }));
  await page.route("**/api/v1/search**", (route) => route.fulfill({ json: { data: { items: [fixturePost(2)], total: 1, page: 1, limit: 12 } } }));
  await enterApp(page, { role: "user" });
  await page.route("**/api/v1/library-state", async (route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    const body = route.request().postDataJSON() as { action?: string };
    if (failLikeUpdate && body.action === "like") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 500, json: { error: "点赞保存失败" } });
      return;
    }
    await route.fulfill({ json: { data: {} } });
  });
  const textPost = { ...fixturePost(2), image: undefined, images: undefined, thumbnailImages: undefined };
  const brokenPost = { ...fixturePost(3), image: "/broken-cover.png", images: ["/broken-cover.png"], thumbnailImages: ["/broken-cover.png"] };
  await page.route("**/api/demo/cards**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") !== "discover") return route.continue();
    await route.fulfill({ json: { data: { items: [fixturePost(1), textPost, brokenPost], total: 3, page: 1, limit: 24 } } });
  });
  await page.route("**/broken-cover.png**", (route) => route.fulfill({ status: 404, contentType: "image/png", body: "" }));
  await page.getByRole("button", { name: "发现", exact: true }).click();
  const feed = page.locator(".stable-editorial-feed");
  const firstCard = page.locator(".heika-discovery-card").first();
  await expect(firstCard).toBeVisible();
  const discoverBackground = () => page.locator(".app.app-discover").evaluate((app) => getComputedStyle(app).getPropertyValue("--bg").trim());
  expect(await discoverBackground()).toBe("#0D0F12");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  expect(await discoverBackground()).toBe("#FAF9F6");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(page.locator(".demo-pill")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "推荐" })).toHaveAttribute("aria-selected", "true");
  await expect(firstCard.locator(".discovery-rating-label")).toContainText("待评级");
  await expect(firstCard.locator(".discovery-author-name")).toHaveText("验收账号");
  await expect(firstCard.locator(".discovery-author-avatar")).toHaveCount(0);
  await expect(firstCard.locator(".discovery-author")).toHaveRole("button");
  await expect(firstCard.locator(".discovery-like-count")).toHaveText("12");
  const coverImage = firstCard.locator(".discovery-cover-open img");
  await expect.poll(() => coverImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const naturalRatio = await coverImage.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight);
  const renderedRatio = await coverImage.evaluate((image: HTMLImageElement) => image.getBoundingClientRect().width / image.getBoundingClientRect().height);
  expect(Math.abs(renderedRatio - naturalRatio)).toBeLessThan(0.03);
  const textCard = page.locator('.heika-discovery-card[data-discover-id="2"]');
  await expect(textCard.locator(".discovery-cover.is-text-only")).toContainText("用于本地浏览器验收的内容正文");
  const brokenCard = page.locator('.heika-discovery-card[data-discover-id="3"]');
  await expect(brokenCard.locator(".discovery-image-error")).toBeVisible();
  const brokenSizeBefore = await brokenCard.locator(".discovery-cover").boundingBox();
  await brokenCard.getByRole("button", { name: "重试" }).click();
  await expect(brokenCard.locator(".discovery-image-error")).toBeVisible();
  const brokenSizeAfter = await brokenCard.locator(".discovery-cover").boundingBox();
  expect(Math.abs((brokenSizeBefore?.height || 0) - (brokenSizeAfter?.height || 0))).toBeLessThanOrEqual(1);

  const requestsBeforeLayout = discoveryRequests.length;
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("button", { name: "单列浏览" }).click();
  await expect(feed).toHaveClass(/single-column/);
  expect(discoveryRequests.length).toBe(requestsBeforeLayout);
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("button", { name: "双列瀑布流" }).click();
  await expect(feed).not.toHaveClass(/single-column/);
  expect(discoveryRequests.length).toBe(requestsBeforeLayout);

  const categoryRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/demo/cards" && url.searchParams.get("mode") === "discover" && url.searchParams.get("tag") === "科技";
  });
  await page.getByRole("tab", { name: "科技" }).click();
  await categoryRequest;
  await page.getByRole("tab", { name: "推荐" }).click();
  await expect(firstCard).toBeVisible();

  await firstCard.getByRole("button", { name: "点赞" }).click();
  await expect(firstCard.getByRole("button", { name: "取消点赞" })).toHaveAttribute("aria-pressed", "true");
  failLikeUpdate = true;
  await firstCard.getByRole("button", { name: "取消点赞" }).click();
  await expect(firstCard.getByRole("button", { name: "点赞" })).toHaveAttribute("aria-pressed", "false");
  await expect(firstCard.getByRole("button", { name: "取消点赞" })).toHaveAttribute("aria-pressed", "true");
  failLikeUpdate = false;

  await page.evaluate(() => window.scrollTo({ top: 180, behavior: "instant" }));
  await page.waitForTimeout(30);
  const scrollBeforeDetail = await page.evaluate(() => window.scrollY);
  await firstCard.locator(".discovery-cover-open").click();
  await expect(page.locator(".detail")).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeDetail);

  await page.getByRole("button", { name: "搜索内容或用户" }).click();
  await page.getByRole("textbox", { name: "搜索内容或用户" }).fill("浏览器验收");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.locator(".search-post-result").first()).toContainText("浏览器验收内容 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("report sheet and admin queue use the same theme tokens for signed-in accounts", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await enterApp(page, { role: "admin" });
  await page.getByRole("button", { name: "发现" }).click();
  await page.locator(".stable-editorial-feed .post-card").first().click();
  await page.locator(".detail-more-button").click();
  await page.getByRole("button", { name: "举报内容" }).click();
  await expect(page.getByRole("heading", { name: "举报内容" })).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#0D0F12");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "返回" }).click();

  await page.evaluate(() => localStorage.setItem("heika-theme", "light"));
  await page.reload();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.locator(":root").getAttribute("data-theme")).toBe("light");
  await page.getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: /管理后台/ }).click();
  await expect(page.getByRole("heading", { name: "管理后台" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /内容举报/ }).click();
  await expect(page.getByRole("heading", { name: "内容举报" })).toBeVisible();
  await expect(page.getByText("当前没有符合条件的举报。" )).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#f6f5f1");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
