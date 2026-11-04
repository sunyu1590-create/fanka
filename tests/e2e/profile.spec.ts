import { expect, test } from "@playwright/test";

test("profile keeps its compact layout, discovery tools, and theme controls", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("heika-demo-v1", JSON.stringify({
      onboardingDone: true,
      name: "探索者",
      bio: "收藏那些值得再读的瞬间",
      own: [{ id: 9901, title: "一段城市记录", body: "在街角停下来，记录一次日常探索。", tag: "生活", author: "探索者", image: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=", images: [], status: "published" }],
    }));
  });
  await page.route("**/api/client-config", () => {});
  await page.route("**/api/demo/cards**", () => {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "我的" }).click();

  const mine = page.locator(".mine-page");
  await expect(mine).toBeVisible();
  await expect(mine.locator(".mine-title")).toHaveCount(0);
  await expect(mine.getByRole("tab")).toHaveCount(3);
  await expect(mine.locator(".mine-profile-card h2")).toHaveText("探索者");
  await expect(mine.locator(".mine-works-masonry > .mine-work-card")).toHaveCount(1);
  const mobileLayout = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".mine-works-masonry")!).gridTemplateColumns.split(" ").length,
    coverRatio: (() => { const rect = document.querySelector(".mine-work-card .post-cover")!.getBoundingClientRect(); return rect.width / rect.height; })(),
    overflows: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(mobileLayout.columns).toBe(2);
  expect(mobileLayout.coverRatio).toBeCloseTo(0.75, 1);
  expect(mobileLayout.overflows).toBe(false);

  const missionToggle = mine.getByRole("button", { name: /今日探索任务/ });
  await expect(missionToggle).toHaveAttribute("aria-expanded", "false");
  await missionToggle.click();
  await expect(missionToggle).toHaveAttribute("aria-expanded", "true");
  await expect(mine.getByText(/登录后查看每日任务/)).toBeVisible();
  await mine.getByRole("tab", { name: "我的收藏" }).click();
  await expect(mine.getByRole("tab", { name: "我的收藏" })).toHaveAttribute("aria-selected", "true");
  await mine.getByRole("tab", { name: "我的点赞" }).click();
  await expect(mine.getByRole("tab", { name: "我的点赞" })).toHaveAttribute("aria-selected", "true");

  await mine.getByRole("button", { name: /探索中心/ }).click();
  await expect(page.locator(".exploration-center-page")).toBeVisible();
  await expect(page.locator("button[aria-controls='exploration-calendar-content']")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".exploration-calendar .calendar-day")).toHaveCount(28);
  await page.getByRole("button", { name: "和朋友一起探索" }).click();
  await expect(page.locator(".co-explore-page")).toBeVisible();
  await page.getByRole("button", { name: "返回，当前页面：探索中心" }).click();
  await expect(page.locator(".exploration-center-page")).toBeVisible();
  await page.locator(".exploration-center-actions").getByRole("button", { name: /探索月报/ }).click();
  await expect(page.locator(".monthly-recap-page")).toBeVisible();
  await page.getByRole("button", { name: "返回，当前页面：探索中心" }).click();
  await expect(page.locator(".exploration-center-page")).toBeVisible();
  await page.locator(".exploration-center-actions").getByRole("button", { name: /卡片接龙/ }).click();
  await expect(page.locator(".card-chain-page")).toBeVisible();
  await page.getByRole("button", { name: "返回，当前页面：探索中心" }).click();
  await page.getByRole("button", { name: "返回，当前页面：探索中心" }).click();

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: /个人设置/ }).click();
  await page.getByRole("button", { name: /外观主题/ }).click();
  await page.getByRole("radio", { name: /浅色/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".mine-page")).toHaveCount(0);
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.getByRole("button", { name: "返回，当前页面：设置" }).click();
  await page.getByRole("button", { name: "返回，当前页面：我的" }).click();
  await expect(page.locator(".mine-page")).toBeVisible();
  await page.locator(".mine-page").getByRole("tab", { name: "我的作品" }).click();
  await page.locator(".mine-page").getByRole("button", { name: /作品管理/ }).click();
  await expect(page.locator(".my-content-page h1")).toContainText("作品管理");
  await expect(page.locator(".my-content-page").getByRole("button", { name: "新建" })).toBeVisible();
  await expect(page.locator(".my-content-page").getByRole("button", { name: "发布内容" })).toHaveCount(0);
  await page.getByRole("button", { name: "返回，当前页面：我的" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopLayout = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".mine-works-masonry")!).gridTemplateColumns.split(" ").length,
    overflows: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(desktopLayout.columns).toBe(2);
  expect(desktopLayout.overflows).toBe(false);
});
