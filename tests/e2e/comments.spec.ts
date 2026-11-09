import { expect, test } from "@playwright/test";

function fixturePost(id: number) {
  const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='800'%3E%3Crect width='600' height='800' fill='%23333'/%3E%3C/svg%3E";
  return {
    id, cloudId: `comment-post-${id}`, status: "published", tag: "生活", topics: [], title: `评论区验收内容 ${id}`,
    body: "用于检查详情页评论排版和交互。", cover: "评论区验收", author: "验收作者", authorId: "acceptance-user",
    date: "2026-11-06", image, images: [image], isDemo: true,
  };
}

test("detail comments stay readable and interactions work from phone to desktop", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    Math.random = () => 0.999;
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem("sb-acceptance-auth-token", JSON.stringify({
      access_token: "e30.eyJzdWIiOiJhY2NlcHRhbmNlLXVzZXIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig",
      token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "acceptance-refresh",
      user: { id: "acceptance-user", aud: "authenticated", role: "authenticated", email: "acceptance@example.test", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: new Date().toISOString() },
    }));
  });
  await page.route("**/api/client-config", (route) => route.fulfill({ json: { url: "https://acceptance.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature" } }));
  await page.route("https://acceptance.supabase.co/auth/v1/user**", (route) => route.fulfill({ json: {
    id: "acceptance-user", aud: "authenticated", role: "authenticated", email: "acceptance@example.test",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-11-01T00:00:00.000Z",
  } }));
  await page.route("**/api/v1/library-state", (route) => route.fulfill({ json: { data: {
    profile: { nickname: "验收用户", bio: "", avatar_url: null, role: "user" }, prefs: null, bookmarks: [], interactions: [], interests: [], own: [],
  } } }));
  await page.route("**/api/v1/progression", (route) => route.fulfill({ json: { data: { total: 0, membershipTier: "free", events: [], claimedLevels: [] } } }));
  await page.route("**/api/demo/cards**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { id?: number };
      return route.fulfill({ json: { data: fixturePost(Number(body.id) || 1) } });
    }
    return route.fulfill({ json: { data: Array.from({ length: 12 }, (_, index) => fixturePost(index + 1)) } });
  });

  const now = Date.now();
  const comments = [
    { id: 101, cloudId: "comment-101", post: 1, body: "混排长评论 EnglishWordsAndCharacters1234567890 用于检查长文本不会被挤成竖排，并且窄屏也能正常换行。", authorId: "acceptance-user", name: "超长昵称测试-应该被省略而不是挤压正文", time: now - 10000, likes: 3 },
    { id: 102, cloudId: "comment-102", post: 1, body: "第一条回复", authorId: "user-2", name: "回复用户一", parent: 101, replyToName: "超长昵称测试", time: now - 9000, likes: 2 },
    { id: 103, cloudId: "comment-103", post: 1, body: "第二条回复", authorId: "user-3", name: "回复用户二", parent: 101, replyToName: "超长昵称测试", time: now - 8000, likes: 1 },
    { id: 104, cloudId: "comment-104", post: 1, body: "第三条回复内容", authorId: "user-4", name: "回复用户三", parent: 101, replyToName: "回复用户二", time: now - 7000, likes: 0 },
  ];
  const commentRequests: { action?: string; parent?: number; body?: string }[] = [];
  await page.route("**/api/library-comments**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: { items: comments, total: comments.length, offset: 0, limit: 40 } } });
    const payload = route.request().postDataJSON() as { action?: string; post?: number; id?: number; parent?: number; value?: boolean; body?: string };
    commentRequests.push(payload);
    if (payload.action === "like") return route.fulfill({ json: { data: { saved: true } } });
    const item = { id: 105, cloudId: "comment-105", post: 1, body: payload.body || "", authorId: "acceptance-user", name: "验收用户", parent: payload.parent === 102 ? 101 : payload.parent, replyToName: payload.parent === 102 ? "回复用户一" : "超长昵称测试", time: Date.now(), likes: 0 };
    return route.fulfill({ json: { data: item } });
  });
  await page.route("**/api/v1/posts/1/rating", (route) => route.fulfill({ json: { data: { average: 4.2, count: 12, experience: { total: 5 } } } }));

  await page.goto("/");
  const skip = page.getByRole("button", { name: /先随便看看/ });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect.poll(async () => await skip.isVisible().catch(() => false) || await navigation.isVisible().catch(() => false), { timeout: 15000 }).toBeTruthy();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole("button", { name: "发现", exact: true }).click();
  await page.locator(".stable-editorial-feed .post-card").first().click();
  await expect(page.locator(".detail-comments .comment").first()).toBeVisible();

  for (const width of [375, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      body: document.querySelector<HTMLElement>(".detail-comments .comment-content")?.getBoundingClientRect().width || 0,
      text: document.querySelector<HTMLElement>(".detail-comments .comment-body")?.getBoundingClientRect().width || 0,
      writingMode: getComputedStyle(document.querySelector<HTMLElement>(".detail-comments .comment-body")!).writingMode,
    }));
    expect(sizes.page, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(sizes.viewport + 1);
    expect(sizes.body, `comment body too narrow at ${width}px`).toBeGreaterThan(180);
    expect(sizes.text, `comment text too narrow at ${width}px`).toBeGreaterThan(160);
    expect(sizes.writingMode).toBe("horizontal-tb");
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".comment-like").first()).toHaveAttribute("aria-label", "点赞评论，3");
  await page.locator(".comment-like").first().click();
  await expect(page.locator(".comment-like").first()).toHaveAttribute("aria-pressed", "true");
  expect(commentRequests.some((request) => request.action === "like")).toBeTruthy();

  await expect(page.locator(".comment-replies-extra")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "展开 1 条回复" }).click();
  await expect(page.getByText("第三条回复内容", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收起回复" }).click();
  await expect(page.locator(".comment-replies-extra")).toHaveAttribute("aria-hidden", "true");

  await page.locator(".comment-actions-menu summary").first().click();
  const rootMenu = page.locator(".comment-actions-panel").first();
  await expect(rootMenu.getByRole("button", { name: "删除评论" })).toBeVisible();
  await page.locator(".comment-reply .comment-actions-menu summary").first().click();
  await expect(page.locator(".comment-actions-panel").filter({ has: page.getByRole("button", { name: "举报回复" }) })).toBeVisible();

  const rating = page.locator(".detail-rating");
  await rating.getByRole("button", { name: "4 星" }).click();
  await expect(page.locator(".detail-rating-current")).toHaveText("4 星");

  await page.locator(".comment-reply").first().getByRole("button", { name: "回复", exact: true }).click();
  const input = page.getByRole("textbox", { name: "评论内容" });
  await expect(page.locator(".reply-label")).toContainText("回复 @回复用户一");
  await expect(input).toHaveAttribute("rows", "3");
  await input.fill("这是一条新的回复");
  await page.getByRole("button", { name: "发送评论" }).click();
  await expect(page.getByText("这是一条新的回复", { exact: true })).toBeVisible();
  expect(commentRequests.some((request) => request.parent === 102 && request.body === "这是一条新的回复")).toBeTruthy();
});
