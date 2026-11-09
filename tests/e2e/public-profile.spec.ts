import { expect, test, type Page } from "@playwright/test";

const visitorId = "00000000-0000-4000-8000-000000000001";
const creatorId = "00000000-0000-4000-8000-000000000002";
const svg = (width: number, height: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#778899"/></svg>`)}`;

async function preparePublicProfile(page: Page, profileId = creatorId) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true }));
    localStorage.setItem(`heika-user-${userId}`, JSON.stringify({ onboardingDone: true }));
    localStorage.setItem("heika-theme", "dark");
    localStorage.setItem("sb-profile-test-auth-token", JSON.stringify({
      access_token: `e30.${btoa(JSON.stringify({ sub: userId, role: "authenticated" })).replace(/=/g, "")}.sig`,
      token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "profile-refresh",
      user: { id: userId, aud: "authenticated", role: "authenticated", email: "profile@example.test", app_metadata: {}, user_metadata: {} },
    }));
  }, { userId: visitorId });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/client-config") return route.fulfill({ json: { url: "https://profile-test.supabase.co", key: "test-public-key" } });
    if (url.pathname.startsWith("/api/demo/cards")) return route.fulfill({ json: { data: [] } });
    if (url.pathname === "/api/v1/library-state") return route.fulfill({ json: { data: { profile: { nickname: "访问者", role: "user" }, own: [], prefs: null, bookmarks: [], interactions: [], interests: [] } } });
    if (url.pathname === "/api/v1/progression") return route.fulfill({ json: { data: { total: 0, membershipTier: "free", events: [], claimedLevels: [] } } });
    if (url.pathname === "/api/v1/creator-follows") {
      const following = route.request().method() === "POST";
      return route.fulfill({ json: { data: { following, followerCount: following ? 13 : 12 } } });
    }
    return route.fulfill({ status: 200, json: { data: {} } });
  });

  await page.route("https://profile-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: { id: visitorId, aud: "authenticated", role: "authenticated", email: "profile@example.test", app_metadata: {}, user_metadata: {} } });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: { nickname: "一位认真记录生活的创作者", bio: "用文字记录日常灵感，分享阅读、生活与技术。".repeat(8), avatar_url: null, show_bookmarks: true } });
    if (url.pathname === "/rest/v1/profile_attributes") return route.fulfill({ json: [
      { attribute: "gender", value: "undisclosed" },
      { attribute: "mbti", value: "INFP" },
      { attribute: "hobbies", value: JSON.stringify(["阅读", "摄影", "散步", "设计"]) },
    ] });
    if (url.pathname === "/rest/v1/posts") {
      return route.fulfill({ json: Array.from({ length: 8 }, (_, index) => ({
        client_id: index + 1,
        title: index === 0 ? "一个较长但会被限制在两行内的标题，用来检查卡片布局" : `作品 ${index + 1}`,
        body: "正文摘要不应堆在个人主页卡片中。",
        image_url: index % 3 === 0 ? svg(300, 500) : index % 3 === 1 ? svg(500, 300) : null,
        created_at: "2026-11-01T12:00:00.000Z",
        post_media: [],
      })) });
    }
    if (url.pathname === "/rest/v1/bookmarks") return route.fulfill({ json: [1, 2].map((id) => ({ created_at: "2026-11-02T12:00:00.000Z", posts: { client_id: 100 + id, title: `公开收藏 ${id}`, body: "收藏正文", image_url: null, post_media: [] } })) });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/?profile=${profileId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("dialog", { name: "个人主页" })).toBeVisible();
  await expect(page.locator(".public-profile-grid .public-profile-post").first()).toBeVisible();
}

test("public profile is compact, responsive, sticky, and keeps follow and bookmark interactions", async ({ page }) => {
  await preparePublicProfile(page);
  const profile = page.locator(".public-profile");
  await expect(profile.locator(".public-profile-avatar")).toHaveCSS("width", "68px");
  await expect(profile.locator(".public-profile-name-block h1")).toContainText("一位认真记录生活的创作者");
  await expect(profile.getByRole("button", { name: "关注", exact: true })).toBeVisible();
  await profile.getByRole("button", { name: "关注", exact: true }).click();
  await expect(profile.getByRole("button", { name: "已关注", exact: true })).toBeVisible();
  await expect(profile.getByLabel("粉丝 13")).toBeVisible();

  const cards = profile.locator(".public-profile-grid .public-profile-post");
  await expect(cards).toHaveCount(8);
  await expect(profile.locator(".public-profile-post-copy small")).toHaveCount(8);
  await expect(profile.locator(".public-profile-post-excerpt")).toHaveCount(0);
  await expect(profile.getByRole("tab", { name: /收藏/ })).toBeVisible();
  await profile.getByRole("tab", { name: /收藏/ }).click();
  await expect(profile.getByText("公开收藏 1")).toBeVisible();
  await profile.getByRole("tab", { name: /笔记/ }).click();

  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".public-profile-grid")!).columnCount,
    overflow: document.documentElement.scrollWidth > innerWidth,
    scrollTop: document.querySelector(".public-profile-scroll")!.getBoundingClientRect().top,
    tabTop: document.querySelector(".public-profile-tabs")!.getBoundingClientRect().top,
  }));
  expect(mobile.columns).toBe("2");
  expect(mobile.overflow).toBe(false);
  await page.locator(".public-profile-scroll").evaluate((node) => { node.scrollTop = 340; });
  await expect.poll(async () => page.locator(".public-profile-tabs").evaluate((node) => Math.abs(node.getBoundingClientRect().top - node.closest(".public-profile-scroll")!.getBoundingClientRect().top))).toBeLessThan(5);

  await page.setViewportSize({ width: 1280, height: 900 });
  const desktop = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".public-profile-grid")!).columnCount,
    width: document.querySelector(".public-profile-grid")!.getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(desktop.columns).toBe("2");
  expect(desktop.width).toBeLessThanOrEqual(780);
  expect(desktop.overflow).toBe(false);

  await profile.getByRole("button", { name: "更多操作" }).click();
  await expect(profile.getByRole("menuitem", { name: "分享个人主页" })).toBeVisible();
});

test("own public profile offers entry to the existing personal page without a follow-self action", async ({ page }) => {
  await preparePublicProfile(page, visitorId);
  const profile = page.locator(".public-profile");
  await expect(profile.getByRole("button", { name: "进入我的主页" })).toBeVisible();
  await expect(profile.getByRole("button", { name: "关注", exact: true })).toHaveCount(0);
  await expect(profile.getByRole("button", { name: "私信" })).toHaveCount(0);
  await profile.getByRole("button", { name: "进入我的主页" }).click();
  await expect(page.locator(".mine-page")).toBeVisible();
});
