import { expect, test } from "@playwright/test";

const plans = [
  { tier: "free", name: "Free", daily_flip_allowance: 5, price_cents: 0, currency: "CNY", duration_days: null, benefits: ["每日 5 次翻卡"], active: true },
  { tier: "plus", name: "Plus", daily_flip_allowance: 9, price_cents: 1200, currency: "CNY", duration_days: 30, benefits: ["每日 9 次翻卡"], active: true },
  { tier: "pro", name: "Pro", daily_flip_allowance: 13, price_cents: 1600, currency: "CNY", duration_days: 30, benefits: ["每日 13 次翻卡"], active: true },
];

test("membership center loads server plans and confirms the selected Afdian tier on mobile and desktop", async ({ page }) => {
  await page.route("**/api/client-config", (route) => route.fulfill({ json: { url: "https://membership.supabase.co", key: "test-public-key" } }));
  await page.route("**/api/v1/membership**", (route) => route.fulfill({ json: { data: { membership: null, plans } } }));

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/membership");
    await expect(page.getByRole("heading", { name: "会员与支持" })).toBeVisible();
    await expect(page.locator(".heika-membership-plan")).toHaveCount(3);
    await page.locator(".heika-membership-plan.tier-plus").click();
    await page.locator(".heika-membership-external-cta > button").click();
    await expect(page.locator(".heika-membership-support-confirm")).toContainText("Plus · ¥12 / 30 天");
    await expect(page.locator(".heika-membership-support-confirm a")).toHaveAttribute("href", "https://afdian.com/a/heikaka");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("standalone membership center shows the signed-in account EXP and active tier", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sb-membership-auth-token", JSON.stringify({
      access_token: "e30.eyJzdWIiOiJtZW1iZXJzaGlwLXVzZXIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig",
      token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "membership-refresh", user: { id: "membership-user", aud: "authenticated", role: "authenticated", email: "member@example.test", app_metadata: {}, user_metadata: {} },
    }));
  });
  await page.route("**/api/client-config", (route) => route.fulfill({ json: { url: "https://membership.supabase.co", key: "test-public-key" } }));
  await page.route("**/api/v1/membership**", (route) => route.fulfill({ json: { data: { membership: { tier: "pro", startsAt: "2026-11-01T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z", pendingTier: null, pendingDays: 0, source: "redeem", dailyFlipAllowance: 13, baseDailyFlipAllowance: 13, dailyFlipsUsed: 4, dailyLuckyBonus: 0 }, plans } } }));
  await page.route("**/api/v1/progression**", (route) => route.fulfill({ json: { data: { total: 4241, events: [], claimedLevels: [] } } }));
  await page.goto("/membership");
  await expect(page.getByRole("region", { name: "当前会员状态" }).locator(".heika-membership-status-main strong").first()).toHaveText("Pro");
  await expect(page.locator(".heika-membership-status-meta")).toContainText("EXP 4,241");
});

test("membership code preview stays separate from the final confirmation request", async ({ page }) => {
  const requests: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sb-membership-auth-token", JSON.stringify({
      access_token: "e30.eyJzdWIiOiJtZW1iZXJzaGlwLXVzZXIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig",
      token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "membership-refresh", user: { id: "membership-user", aud: "authenticated", role: "authenticated", email: "member@example.test", app_metadata: {}, user_metadata: {} },
    }));
  });
  await page.route("**/api/client-config", (route) => route.fulfill({ json: { url: "https://membership.supabase.co", key: "test-public-key" } }));
  await page.route("**/api/v1/membership/redeem/preview", async (route) => {
    requests.push("preview");
    await route.fulfill({ json: { data: { status: "valid", previewToken: "4d3efb31-266d-4b76-9eef-1c3d6a7ec7a2", tier: "plus", planName: "Plus", dailyFlipAllowance: 9, durationDays: 30 } } });
  });
  await page.route("**/api/v1/membership/redeem/confirm", async (route) => {
    requests.push("confirm");
    await route.fulfill({ json: { data: { status: "redeemed", tier: "plus", redeemedTier: "plus", activationState: "active", startsAt: "2026-11-14T00:00:00.000Z", expiresAt: "2026-12-14T00:00:00.000Z", dailyFlipAllowance: 9 } } });
  });

  await page.goto("/membership/redeem");
  const code = page.getByLabel("会员激活码");
  await code.fill("heika-7k9p-4m2x-q8tr");
  await code.press("Enter");
  await expect(page.locator(".membership-redeem-preview")).toContainText("Plus");
  expect(requests).toEqual(["preview"]);
  await page.getByRole("button", { name: /确认兑换/ }).click();
  await expect(page.getByRole("heading", { name: "会员已激活" })).toBeVisible();
  expect(requests).toEqual(["preview", "confirm"]);
});
