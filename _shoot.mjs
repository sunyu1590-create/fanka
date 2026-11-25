import fs from "node:fs";
import { chromium } from "playwright";

const session = JSON.parse(fs.readFileSync("/tmp/session.json", "utf8"));
const BASE = "https://moonclean.shop";
const OUT = "/tmp/shots-264";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const problems = [];
const taken = [];

async function newPage(viewport, theme, mobile = false) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  await ctx.addInitScript(([sess, th]) => {
    localStorage.setItem("sb-moonclean-auth-token", JSON.stringify(sess));
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true }));
    localStorage.setItem("heika-theme", th);
  }, [session, theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message}`.slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console ${m.text().slice(0, 160)}`);
  });
  await page.goto(BASE + "/?admin=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
  return { ctx, page };
}

async function shot(page, name, full = true) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  taken.push(name);
}

async function nav(page, label) {
  const btn = page.locator("button").filter({ hasText: new RegExp(`^${label}`) }).first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(1800);
}

async function tab(page, label) {
  const btn = page.locator("button").filter({ hasText: new RegExp(`^${label}$`) }).first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(1600);
}

// ---------- 桌面 深色 ----------
{
  const { ctx, page } = await newPage({ width: 1440, height: 1000 }, "dark");
  await shot(page, "d01-overview", false);

  await nav(page, "监控");
  await shot(page, "d02-hub-monitor");

  await page.locator("button.ab-row").filter({ hasText: "系统监控" }).first().click();
  await page.waitForTimeout(2200);
  await shot(page, "d03-system-monitor");

  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "媒体服务" }).first().click();
  await page.waitForTimeout(2600);
  await shot(page, "d04-media-overview");

  await tab(page, "传输任务");
  await shot(page, "d05-media-transfer");

  await tab(page, "历史记录");
  await shot(page, "d06-media-history-folded");

  // 展开第一条历史分组
  const fold = page.locator(".ab-fold__head, details > summary").first();
  if (await fold.count()) {
    await fold.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1600);
    await shot(page, "d07-media-history-expanded");
  }

  await tab(page, "资源管理");
  await shot(page, "d08-resources-overview");

  await tab(page, "资源列表");
  await shot(page, "d09-resources-list");

  // 打开第一条资源详情
  const item = page.locator("button.ab-item").first();
  if (await item.count()) {
    await item.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "d10-resource-detail");
    const back = page.locator('button[aria-label="返回资源列表"]').first();
    if (await back.count()) { await back.click().catch(() => {}); await page.waitForTimeout(1200); }
  }

  await tab(page, "健康检查");
  await shot(page, "d11-resources-health");

  await tab(page, "热门资源");
  await shot(page, "d12-resources-rankings");

  await nav(page, "审核");
  await shot(page, "d13-hub-review");

  await page.locator("button.ab-row").filter({ hasText: "人工复审" }).first().click();
  await page.waitForTimeout(2600);
  await shot(page, "d14-review-center");

  // 选择模式 + 清理弹窗
  const selectBtn = page.locator("button").filter({ hasText: /^选择记录$/ }).first();
  if (await selectBtn.count()) {
    await selectBtn.click().catch(() => {});
    await page.waitForTimeout(900);
    const box = page.locator('input[type="checkbox"]').first();
    if (await box.count()) { await box.click().catch(() => {}); await page.waitForTimeout(600); }
    await shot(page, "d15-review-select-mode");
    const cleanBtn = page.locator("button").filter({ hasText: /清理所选/ }).first();
    if (await cleanBtn.count()) {
      await cleanBtn.click().catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, "d16-review-cleanup-dialog", false);
      const cancel = page.locator("button").filter({ hasText: /取消|关闭/ }).first();
      if (await cancel.count()) await cancel.click().catch(() => {});
      await page.waitForTimeout(700);
    }
    const exitSelect = page.locator("button").filter({ hasText: /^取消选择$/ }).first();
    if (await exitSelect.count()) await exitSelect.click().catch(() => {});
  }

  // 已归档折叠区
  const archiveHead = page.locator("button, summary, .ab-fold__head").filter({ hasText: /已归档复审记录/ }).first();
  if (await archiveHead.count()) {
    await archiveHead.click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "d17-review-archived");
  }

  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "任务中心" }).first().click();
  await page.waitForTimeout(2400);
  await shot(page, "d18-task-center");

  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "进程监控" }).first().click();
  await page.waitForTimeout(2400);
  await shot(page, "d19-processes");

  await nav(page, "管理");
  await shot(page, "d20-hub-manage");
  await page.locator("button.ab-row").filter({ hasText: "运营成本" }).first().click();
  await page.waitForTimeout(2400);
  await shot(page, "d21-cost");

  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "系统告警" }).first().click();
  await page.waitForTimeout(2200);
  await shot(page, "d22-alerts");

  await ctx.close();
}

// ---------- 桌面 浅色 ----------
{
  const { ctx, page } = await newPage({ width: 1440, height: 1000 }, "light");
  await shot(page, "l01-overview", false);
  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "媒体服务" }).first().click();
  await page.waitForTimeout(2600);
  await shot(page, "l02-media-overview");
  await tab(page, "资源管理");
  await shot(page, "l03-resources-overview");
  await nav(page, "审核");
  await page.locator("button.ab-row").filter({ hasText: "人工复审" }).first().click();
  await page.waitForTimeout(2400);
  await shot(page, "l04-review-center");
  await ctx.close();
}

// ---------- 手机 深色 ----------
{
  const { ctx, page } = await newPage({ width: 390, height: 844 }, "dark", true);
  await shot(page, "m01-overview");

  await nav(page, "监控");
  await shot(page, "m02-hub-monitor");
  await page.locator("button.ab-row").filter({ hasText: "媒体服务" }).first().click();
  await page.waitForTimeout(2600);
  await shot(page, "m03-media-overview");

  await tab(page, "传输任务");
  await shot(page, "m04-media-transfer");
  await tab(page, "资源管理");
  await shot(page, "m05-resources-overview");
  await tab(page, "资源列表");
  await shot(page, "m06-resources-list");

  await nav(page, "审核");
  await page.locator("button.ab-row").filter({ hasText: "人工复审" }).first().click();
  await page.waitForTimeout(2400);
  await shot(page, "m07-review-center");

  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "任务中心" }).first().click();
  await page.waitForTimeout(2200);
  await shot(page, "m08-task-center");

  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "进程监控" }).first().click();
  await page.waitForTimeout(2200);
  await shot(page, "m09-processes");

  await nav(page, "管理");
  await page.locator("button.ab-row").filter({ hasText: "运营成本" }).first().click();
  await page.waitForTimeout(2200);
  await shot(page, "m10-cost");
  await ctx.close();
}

// ---------- 手机 浅色 ----------
{
  const { ctx, page } = await newPage({ width: 390, height: 844 }, "light", true);
  await shot(page, "n01-overview");
  await nav(page, "监控");
  await page.locator("button.ab-row").filter({ hasText: "媒体服务" }).first().click();
  await page.waitForTimeout(2400);
  await shot(page, "n02-media-overview");
  await tab(page, "资源管理");
  await shot(page, "n03-resources-overview");
  await ctx.close();
}

await browser.close();
console.log("SHOTS", taken.length, taken.join(","));
const uniq = [...new Set(problems)];
console.log("PROBLEMS", uniq.length);
for (const p of uniq.slice(0, 12)) console.log(" -", p);
