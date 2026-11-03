import { expect, test, type Route } from "@playwright/test";

test("cached navigation starts while configuration and card requests are stalled", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true, opened: { "2026-11-01": [1] }, revealed: {} }));
  });
  // Deliberately leave these requests pending: the UI must not depend on either.
  await page.route("**/api/client-config", () => {});
  await page.route("**/api/demo/cards**", () => {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible({ timeout: 3000 });
  await expect(page.locator(".editorial-skeleton")).toHaveCount(0);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "我的" }).click();
  await expect(page.locator(".mine-profile-hero")).toBeVisible();
});

test("signed-in cache is restored before cloud data and repeated auth focus does not reload it", async ({ page }) => {
  let libraryReads = 0;
  let pendingLibrary: Route | undefined;
  await page.addInitScript(() => {
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true }));
    localStorage.setItem("heika-user-startup-user", JSON.stringify({ onboardingDone: true, name: "缓存用户" }));
    localStorage.setItem("sb-startup-auth-token", JSON.stringify({
      access_token: "e30.eyJzdWIiOiJzdGFydHVwLXVzZXIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig",
      token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "startup-refresh", user: { id: "startup-user", aud: "authenticated", role: "authenticated", email: "startup@example.test", app_metadata: {}, user_metadata: {} },
    }));
  });
  await page.route("**/api/client-config", (route) => route.fulfill({ json: { url: "https://startup.supabase.co", key: "test-public-key" } }));
  await page.route("**/api/demo/cards**", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/progression", (route) => route.fulfill({ json: { data: { total: 0, membershipTier: "free", events: [], claimedLevels: [] } } }));
  await page.route("**/api/v1/library-state", (route) => {
    if (route.request().method() === "GET") { libraryReads++; pendingLibrary = route; }
    // Keep hydration pending so it cannot be responsible for the displayed name.
  });
  await page.route("https://startup.supabase.co/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => libraryReads).toBe(1);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "我的" }).click();
  await expect(page.locator(".mine-profile-card h2")).toHaveText("缓存用户");
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++) document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".mine-profile-card h2")).toHaveText("缓存用户");
  expect(libraryReads).toBe(1);
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await page.getByRole("button", { name: /安全中心.*隐私/ }).click();
  await page.getByRole("button", { name: "退出账号" }).click();
  await expect(page.locator(".messaging-preferences-empty")).toBeVisible();
  await pendingLibrary!.fulfill({ json: { data: {
    profile: { nickname: "迟到旧账号", bio: "", avatar_url: null, role: "admin" },
    bookmarks: [], interactions: [], interests: [], own: [], profileDetails: [], prefs: null,
  } } });
  await expect(page.locator(".messaging-preferences-empty")).toBeVisible();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.getByRole("button", { name: "返回，当前页面：我的" }).click();
  await expect(page.locator(".mine-profile-card h2")).toHaveText("探索者");
  await expect(page.getByText("迟到旧账号", { exact: true })).toHaveCount(0);
});
