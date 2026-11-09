import { expect, test } from "@playwright/test";

test("settings center groups are reachable and about and notification states are truthful", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true }));
  });
  await page.route("**/api/client-config", (route) => route.fulfill({ json: { url: "https://settings.supabase.co", key: "test-public-key" } }));
  await page.route("**/api/demo/cards**", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "我的" }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.locator(".settings-group")).toHaveCount(5);
  for (const name of ["外观与显示", "浏览与阅读", "消息与通知", "账号与内容", "应用与支持"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  await page.getByRole("button", { name: /关于黑卡/ }).click();
  await expect(page.getByRole("heading", { name: "黑卡 HEIKA" })).toBeVisible();
  await expect(page.getByText("翻开未知，遇见新的想法。")).toBeVisible();
  await expect(page.getByText("由个人开发者创造")).toBeVisible();
  await expect(page.locator(".about-legal-status")).toContainText("正式文本正在准备");
  await expect(page.getByRole("link", { name: /用户协议|隐私政策/ })).toHaveCount(0);
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();

  await page.getByRole("button", { name: /通知与提醒/ }).click();
  await expect(page.getByText("每日探索提醒")).toBeVisible();
  await expect(page.locator(".notification-unavailable")).toContainText("未开放");
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();

  await page.getByRole("button", { name: "意见反馈" }).click();
  await expect(page.getByText("登录后可提交并查看处理进度。")).toBeVisible();
  await expect(page.getByRole("button", { name: "前往登录" })).toBeVisible();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.evaluate(async () => {
    const cache = await caches.open("heika-static-e2e");
    await cache.put("/e2e-cache-entry", new Response("test"));
  });
  await page.getByRole("button", { name: /缓存管理/ }).click();
  const clearCache = page.getByRole("button", { name: "清理缓存" });
  await expect(clearCache).toBeEnabled();
  await clearCache.click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("作品、草稿、收藏和登录状态不会被删除");
  await confirm.getByRole("button", { name: "清理缓存" }).click();
  await expect(page.getByRole("status").filter({ hasText: "缓存已清理" })).toBeVisible();
});
