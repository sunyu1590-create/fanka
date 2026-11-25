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
const fails = [];

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
  await page.waitForTimeout(3600);
  return { ctx, page };
}

async function step(name, fn) {
  try {
    await fn();
  } catch (error) {
    fails.push(`${name}: ${String(error.message || error).slice(0, 140)}`);
  }
}

async function shot(page, name, full = true) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  taken.push(name);
}

async function nav(page, label) {
  const re = new RegExp(`^${label}`);
  const side = page.locator(".ab-sidebar button:visible").filter({ hasText: re }).first();
  if (await side.count()) {
    await side.click({ timeout: 8000 });
  } else {
    await page.locator(".ab-bottomnav button:visible").filter({ hasText: re }).first().click({ timeout: 8000 });
  }
  await page.waitForTimeout(1600);
}

async function openRow(page, title) {
  await page.locator("button.ab-row").filter({ hasText: new RegExp(title) }).first().click({ timeout: 8000 });
  await page.waitForTimeout(2600);
}

async function tab(page, label, aria = "媒体服务视图") {
  const bar = page.locator('[role="tablist"][aria-label="' + aria + '"]').first();
  const btn = bar.locator("button:visible").filter({ hasText: new RegExp(`^${label}$`) }).first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(1800);
}

// ---------- 桌面 深色 ----------
{
  const { ctx, page } = await newPage({ width: 1440, height: 1000 }, "dark");
  await step("d01", async () => { await shot(page, "d01-overview", false); });

  await step("d02", async () => { await nav(page, "监控"); await shot(page, "d02-hub-monitor"); });
  await step("d03", async () => { await openRow(page, "系统监控"); await shot(page, "d03-system-monitor"); });
  await step("d04", async () => { await nav(page, "监控"); await openRow(page, "媒体服务"); await shot(page, "d04-media-overview"); });
  await step("d05", async () => { await tab(page, "传输任务"); await shot(page, "d05-media-transfer"); });
  await step("d06", async () => { await tab(page, "历史记录"); await shot(page, "d06-media-history-folded"); });
  await step("d07", async () => {
    const fold = page.locator(".ab-fold__head").first();
    await fold.click({ timeout: 5000 });
    await page.waitForTimeout(1800);
    await shot(page, "d07-media-history-expanded");
  });
  await step("d08", async () => { await tab(page, "资源管理"); await shot(page, "d08-resources-overview"); });
  await step("d09", async () => { await tab(page, "资源列表", "资源管理视图"); await shot(page, "d09-resources-list"); });
  await step("d10", async () => {
    await page.locator("button.ab-item").first().click({ timeout: 6000 });
    await page.waitForTimeout(2000);
    await shot(page, "d10-resource-detail");
    const back = page.locator('button[aria-label="返回资源列表"]').first();
    if (await back.count()) { await back.click(); await page.waitForTimeout(1200); }
  });
  await step("d11", async () => { await tab(page, "健康检查", "资源管理视图"); await shot(page, "d11-resources-health"); });
  await step("d12", async () => { await tab(page, "热门资源", "资源管理视图"); await shot(page, "d12-resources-rankings"); });

  await step("d13", async () => { await nav(page, "审核"); await shot(page, "d13-hub-review"); });
  await step("d14", async () => { await openRow(page, "人工复审"); await shot(page, "d14-review-center"); });
  await step("d15", async () => {
    const selectBtn = page.locator("button").filter({ hasText: /^选择记录$/ }).first();
    await selectBtn.click({ timeout: 6000 });
    await page.waitForTimeout(1000);
    await shot(page, "d15-review-select-mode");
  });
  await step("d16", async () => {
    const box = page.locator('input[type="checkbox"]').first();
    if (await box.count()) { await box.click(); await page.waitForTimeout(700); }
    const cleanBtn = page.locator("button").filter({ hasText: /清理所选/ }).first();
    await cleanBtn.click({ timeout: 6000 });
    await page.waitForTimeout(1400);
    await shot(page, "d16-review-cleanup-dialog", false);
    const cancel = page.locator("button").filter({ hasText: /^取消$/ }).first();
    if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(800); }
  });
  await step("d17", async () => {
    const exitSelect = page.locator("button").filter({ hasText: /^取消选择$/ }).first();
    if (await exitSelect.count()) { await exitSelect.click(); await page.waitForTimeout(700); }
    const archiveHead = page.locator(".ab-fold__head").filter({ hasText: /已归档复审记录/ }).first();
    if (await archiveHead.count()) {
      await archiveHead.click();
      await page.waitForTimeout(1800);
    }
    await shot(page, "d17-review-archived");
  });

  await step("d18", async () => { await nav(page, "监控"); await openRow(page, "任务中心"); await shot(page, "d18-task-center"); });
  await step("d19", async () => { await nav(page, "监控"); await openRow(page, "进程监控"); await shot(page, "d19-processes"); });
  await step("d20", async () => { await nav(page, "管理"); await shot(page, "d20-hub-manage"); });
  await step("d21", async () => { await openRow(page, "运营成本"); await shot(page, "d21-cost"); });
  await step("d22", async () => { await nav(page, "监控"); await openRow(page, "系统告警"); await shot(page, "d22-alerts"); });
  await step("d23", async () => { await nav(page, "监控"); await openRow(page, "资源管理"); await shot(page, "d23-resources-direct"); });

  await ctx.close();
}

// ---------- 桌面 浅色 ----------
{
  const { ctx, page } = await newPage({ width: 1440, height: 1000 }, "light");
  await step("l01", async () => { await shot(page, "l01-overview", false); });
  await step("l02", async () => { await nav(page, "监控"); await openRow(page, "媒体服务"); await shot(page, "l02-media-overview"); });
  await step("l03", async () => { await tab(page, "资源管理"); await shot(page, "l03-resources-overview"); });
  await step("l04", async () => { await tab(page, "资源列表", "资源管理视图"); await shot(page, "l04-resources-list"); });
  await step("l05", async () => { await nav(page, "审核"); await openRow(page, "人工复审"); await shot(page, "l05-review-center"); });
  await step("l06", async () => { await nav(page, "监控"); await openRow(page, "任务中心"); await shot(page, "l06-task-center"); });
  await step("l07", async () => { await nav(page, "监控"); await openRow(page, "进程监控"); await shot(page, "l07-processes"); });
  await step("l08", async () => { await nav(page, "管理"); await openRow(page, "运营成本"); await shot(page, "l08-cost"); });
  await ctx.close();
}

// ---------- 手机 深色 ----------
{
  const { ctx, page } = await newPage({ width: 390, height: 844 }, "dark", true);
  await step("m01", async () => { await shot(page, "m01-overview"); });
  await step("m02", async () => { await nav(page, "监控"); await shot(page, "m02-hub-monitor"); });
  await step("m03", async () => { await openRow(page, "媒体服务"); await shot(page, "m03-media-overview"); });
  await step("m04", async () => { await tab(page, "传输任务"); await shot(page, "m04-media-transfer"); });
  await step("m05", async () => { await tab(page, "资源管理"); await shot(page, "m05-resources-overview"); });
  await step("m06", async () => { await tab(page, "资源列表", "资源管理视图"); await shot(page, "m06-resources-list"); });
  await step("m07", async () => { await nav(page, "审核"); await openRow(page, "人工复审"); await shot(page, "m07-review-center"); });
  await step("m08", async () => { await nav(page, "监控"); await openRow(page, "任务中心"); await shot(page, "m08-task-center"); });
  await step("m09", async () => { await nav(page, "监控"); await openRow(page, "进程监控"); await shot(page, "m09-processes"); });
  await step("m10", async () => { await nav(page, "管理"); await openRow(page, "运营成本"); await shot(page, "m10-cost"); });
  await ctx.close();
}

// ---------- 手机 浅色 ----------
{
  const { ctx, page } = await newPage({ width: 390, height: 844 }, "light", true);
  await step("n01", async () => { await shot(page, "n01-overview"); });
  await step("n02", async () => { await nav(page, "监控"); await openRow(page, "媒体服务"); await shot(page, "n02-media-overview"); });
  await step("n03", async () => { await tab(page, "资源管理"); await shot(page, "n03-resources-overview"); });
  await step("n04", async () => { await nav(page, "审核"); await openRow(page, "人工复审"); await shot(page, "n04-review-center"); });
  await ctx.close();
}

await browser.close();
console.log("SHOTS", taken.length);
console.log("FAILS", fails.length);
for (const f of fails) console.log(" !", f);
const uniq = [...new Set(problems)];
console.log("PROBLEMS", uniq.length);
for (const p of uniq.slice(0, 10)) console.log(" -", p);
