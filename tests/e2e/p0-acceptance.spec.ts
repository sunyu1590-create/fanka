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
    await page.route("**/api/v1/admin/message-reports**", (route) => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/v1/admin/users**", (route) => route.fulfill({ json: { data: { items: [], total: 0 } } }));
  }
  await page.goto("/");
  const skip = page.getByRole("button", { name: /先随便看看/ });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect.poll(async () => (await skip.isVisible().catch(() => false)) || await navigation.isVisible().catch(() => false)).toBeTruthy();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(navigation).toBeVisible();
}

function fixturePost(id: number) {
  return {
    id, cloudId: `cloud-post-${id}`, status: "published", tag: "生活", topics: ["生活"], title: `浏览器验收内容 ${id}`,
    body: "用于本地浏览器验收的内容正文。", cover: "安静观察日常",
    author: "验收账号", authorId: "acceptance-author", authorAvatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23c9a54b'/%3E%3C/svg%3E", date: "2026-11-01",
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
  expect(light).toBe("#FAF9F6");

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
  await expect(first.locator(".card-back-copy strong")).toHaveText("");
  const before = await first.boundingBox();
  await first.click();
  await expect(page.getByRole("button", { name: "确认翻开" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "今日已翻开 0 / 5 张" })).toBeVisible();
  await page.getByRole("button", { name: "确认翻开" }).click();
  await expect(page.locator(".flip-window-revealed h2")).toHaveText("浏览器验收内容 1");
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

test("discovery feed renders its local cache after a restart when the network is unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterApp(page);
  await page.getByRole("button", { name: "发现" }).click();
  await expect(page.locator(".editorial-feed .post-card").first()).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open("heika-public-content-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!database) return false;
    return await new Promise<boolean>((resolve) => {
      const request = database.transaction("entries").objectStore("entries").get("discover:全部:1");
      request.onsuccess = () => resolve(Boolean(request.result?.value?.items?.length));
      request.onerror = () => resolve(false);
    });
  })).toBe(true);

  await page.unroute("**/api/demo/cards**");
  await page.route("**/api/demo/cards**", (route) => route.abort());
  await page.reload();
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  await page.getByRole("button", { name: "发现" }).click();
  await expect(page.locator(".editorial-feed .post-card").first()).toBeVisible();
  await expect(page.locator(".editorial-feed .post-card").first()).toContainText("浏览器验收内容");
});

test("discovery editorial controls preserve the feed and use live categories, ratings, and authors", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const discoveryRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/demo/cards" && url.searchParams.get("mode") === "discover") {
      discoveryRequests.push(url.search);
    }
  });
  await page.route("**/api/v1/ratings**", (route) => route.fulfill({ json: { data: {} } }));
  await page.route("**/api/v1/library-state", (route) => route.fulfill({ json: { data: { saved: true } } }));
  await page.route("**/api/v1/search**", (route) => route.fulfill({ json: { data: { items: [fixturePost(2)], total: 1, page: 1, limit: 12 } } }));
  await enterApp(page);
  const textPost = { ...fixturePost(2), image: undefined, images: undefined };
  const brokenPost = { ...fixturePost(3), image: "/broken-cover.png", images: ["/broken-cover.png"] };
  await page.route("**/api/demo/cards**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") !== "discover") return route.continue();
    await route.fulfill({ json: { data: { items: [fixturePost(1), textPost, brokenPost], total: 3, page: 1, limit: 24 } } });
  });
  await page.route("**/broken-cover.png", (route) => route.fulfill({ status: 404, contentType: "image/png", body: "" }));
  await page.getByRole("button", { name: "发现" }).click();
  const feed = page.locator(".editorial-feed");
  const firstCard = page.locator(".heika-discovery-card").first();
  await expect(firstCard).toBeVisible();
  await expect(page.locator(".demo-pill")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "推荐" })).toHaveAttribute("aria-selected", "true");
  await expect(firstCard.locator(".discovery-rating-label")).toContainText("待评级");
  await expect(firstCard.locator(".discovery-author-name")).toHaveText("验收账号");
  await expect(firstCard.locator(".discovery-author-avatar img")).toBeVisible();
  const coverImage = firstCard.locator(".discovery-cover-open img");
  await expect.poll(() => coverImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const naturalRatio = await coverImage.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight);
  const renderedRatio = await coverImage.evaluate((image: HTMLImageElement) => image.getBoundingClientRect().width / image.getBoundingClientRect().height);
  expect(Math.abs(renderedRatio - naturalRatio)).toBeLessThan(0.03);
  const textCard = page.locator(".heika-discovery-card").nth(1);
  await expect(textCard.locator(".discovery-cover.is-text-only")).toContainText("用于本地浏览器验收的内容正文");
  const brokenCard = page.locator(".heika-discovery-card").nth(2);
  await expect(brokenCard.locator(".discovery-image-error")).toBeVisible();
  const brokenSizeBefore = await brokenCard.locator(".discovery-cover").boundingBox();
  await brokenCard.getByRole("button", { name: "重试" }).click();
  await expect(brokenCard.locator(".discovery-image-error")).toBeVisible();
  const brokenSizeAfter = await brokenCard.locator(".discovery-cover").boundingBox();
  expect(Math.abs((brokenSizeBefore?.height || 0) - (brokenSizeAfter?.height || 0))).toBeLessThanOrEqual(1);

  const requestsBeforeLayout = discoveryRequests.length;
  await page.getByRole("button", { name: "浏览设置" }).click();
  await page.getByRole("button", { name: "单列浏览" }).click();
  await expect(feed).toHaveClass(/single-column/);
  expect(discoveryRequests.length).toBe(requestsBeforeLayout);
  await page.getByRole("button", { name: "浏览设置" }).click();
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

  await page.getByRole("button", { name: "搜索内容或用户" }).click();
  await page.getByRole("textbox", { name: "搜索内容或用户" }).fill("浏览器验收");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.locator(".search-post-result").first()).toContainText("浏览器验收内容 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("native flip and detail transitions preserve card ratio and animate the shared image with transforms", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    window.HeikaNative = { postMessage: () => {}, onmessage: null };
  });
  await enterApp(page);
  const nativeModalMotion = await page.evaluate(() => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const panel = document.createElement("div");
    panel.className = "modal";
    backdrop.append(panel);
    document.body.append(backdrop);
    const animation = panel.getAnimations()[0];
    const keyframes = (animation?.effect as KeyframeEffect | null)?.getKeyframes() || [];
    const result = {
      backdropFilter: getComputedStyle(backdrop).backdropFilter,
      animationName: getComputedStyle(panel).animationName,
      keyframes: keyframes.map((frame) => Object.keys(frame)),
    };
    backdrop.remove();
    return result;
  });
  expect(nativeModalMotion.backdropFilter).toBe("blur(3px)");
  expect(nativeModalMotion.animationName).toBe("heika-native-modal-in");
  expect(nativeModalMotion.keyframes.every((frame) => !frame.includes("filter"))).toBe(true);
  await page.evaluate(() => {
    const target = window as Window & { __heikaSharedImageKeyframes?: string[][] };
    target.__heikaSharedImageKeyframes = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLImageElement) || node.getAttribute("aria-hidden") !== "true") continue;
          const animation = node.getAnimations()[0];
          const effect = animation?.effect as KeyframeEffect | null;
          const keyframes = effect?.getKeyframes().map((frame) => Object.keys(frame));
          if (keyframes) target.__heikaSharedImageKeyframes?.push(...keyframes);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  await page.getByRole("button", { name: "首页" }).click();
  const card = page.locator(".candidate-feed-card").first();
  await expect(card).toBeVisible();
  const source = await card.boundingBox();
  await card.click();
  const stage = page.locator(".flip-stage");
  await expect(stage).toBeVisible();
  await expect.poll(() => stage.evaluate((node) => node.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
  await page.evaluate(() => {
    const message = {
      version: 1,
      id: "test-background-transition",
      type: "event",
      event: "app.lifecycle",
      payload: { state: "background" },
    };
    window.HeikaNative?.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
  });
  await expect.poll(() => stage.evaluate((node) => node.getAnimations().some((animation) => animation.playState === "running"))).toBe(false);
  await expect.poll(() => stage.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  const stageRatio = await stage.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(Math.abs(stageRatio - (source?.width || 1) / (source?.height || 1))).toBeLessThan(0.025);

  await page.getByRole("button", { name: "确认翻开" }).click();
  await expect(page.locator(".flip-window-revealed h2")).toHaveText("浏览器验收内容 1");
  await page.getByRole("button", { name: "查看更多" }).click();
  await expect(page.locator(".detail")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __heikaSharedImageKeyframes?: string[][] }).__heikaSharedImageKeyframes?.length || 0)).toBeGreaterThan(0);
  const keyframes = await page.evaluate(() => (window as Window & { __heikaSharedImageKeyframes?: string[][] }).__heikaSharedImageKeyframes || []);
  expect(keyframes.every((keys) => keys.includes("transform"))).toBe(true);
  expect(keyframes.some((keys) => keys.some((key) => ["left", "top", "width", "height"].includes(key)))).toBe(false);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.locator(".flip-overlay")).toHaveCount(0);
});

test("native card transition uses the typed prepare, open, close, and release protocol", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    const requests: { type: string; payload: Record<string, unknown> }[] = [];
    const bridge = {
      postMessage(raw: string) {
        const request = JSON.parse(raw) as { version: number; id: string; type: string; payload?: Record<string, unknown> };
        requests.push({ type: request.type, payload: request.payload || {} });
        if (request.type === "card.transition.prepare" || request.type === "card.transition.start" ||
            request.type === "card.transition.cancel" || request.type === "card.transition.release" || request.type === "capabilities.get") {
          const data = request.type === "card.transition.prepare" ? { prepared: true } :
            request.type === "card.transition.start" ? { accepted: true } : {};
          window.setTimeout(() => bridge.onmessage?.(new MessageEvent("message", { data: JSON.stringify({
            version: 1, id: request.id, type: "result", requestType: request.type, ok: true, data,
          }) })), 0);
          if (request.type === "card.transition.start") {
            window.setTimeout(() => bridge.onmessage?.(new MessageEvent("message", { data: JSON.stringify({
              version: 1, id: `native-finished-${requests.length}`, type: "event", event: "card.transition.finished",
              payload: { transactionId: request.payload?.transactionId, completed: true },
            }) })), 120);
          }
        }
      },
      onmessage: null as ((event: MessageEvent<string>) => void) | null,
    };
    (window as Window & { HeikaNative?: typeof bridge; __heikaNativeRequests?: typeof requests }).HeikaNative = bridge;
    (window as Window & { __heikaNativeRequests?: typeof requests }).__heikaNativeRequests = requests;
  });
  await enterApp(page);
  await page.getByRole("button", { name: "发现" }).click();
  const card = page.locator(".editorial-feed .post-card").first();
  await expect(card).toBeVisible();
  await expect.poll(() => card.locator(".discovery-cover-open img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await card.click();
  await expect(page.locator(".detail")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __heikaNativeRequests?: { type: string }[] }).__heikaNativeRequests?.some((entry) => entry.type === "card.transition.start"))).toBe(true);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.locator(".flip-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const requests = (window as Window & { __heikaNativeRequests?: { type: string; payload: Record<string, unknown> }[] }).__heikaNativeRequests || [];
    return requests.some((entry) => entry.type === "card.transition.start" && entry.payload.direction === "close") &&
      requests.some((entry) => entry.type === "card.transition.release");
  })).toBe(true);
});

test("discovery, image detail, and publish composer remain responsive with soft keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await enterApp(page);
  await page.locator(".bottom-nav").getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: /个人设置/ }).click();
  await page.getByRole("button", { name: /发现页布局/ }).click();
  await page.getByRole("radio", { name: /单列阅读/ }).click();
  await page.getByRole("button", { name: /返回，当前页面：设置/ }).click();
  await page.locator(".bottom-nav").getByRole("button", { name: "发现" }).click();
  await expect.poll(() => page.locator(".editorial-feed").evaluate((feed) => getComputedStyle(feed).columnCount)).toBe("1");
  await page.locator(".bottom-nav").getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: /个人设置/ }).click();
  await page.getByRole("button", { name: /发现页布局/ }).click();
  await page.locator(".settings-detail-page").getByRole("radio", { name: /瀑布流/ }).click();
  await page.getByRole("button", { name: /返回，当前页面：设置/ }).click();
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
  await page.getByRole("button", { name: /返回，当前页面：发现/ }).click();
  await expect(page.locator(".detail")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "发布内容" }).click();
  await expect(page.locator(".composer-topbar strong")).toHaveText("分享一篇内容");
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
  await page.getByRole("button", { name: /个人设置/ }).click();
  await page.getByRole("button", { name: /举报与内容审核/ }).click();
  await expect(page.getByRole("heading", { name: /管理后台/ })).toBeVisible();
  await expect(page.getByText("当前没有符合条件的举报。" )).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#FAF9F6");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
