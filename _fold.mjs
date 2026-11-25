import fs from "node:fs";
import { chromium } from "playwright";

const session = JSON.parse(fs.readFileSync("/tmp/session.json", "utf8"));
const BASE = "https://moonclean.shop";
const report = { folds: [], nav: [], fails: [] };

async function withPage(fn) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript((s) => {
    localStorage.setItem("sb-moonclean-auth-token", JSON.stringify(s));
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true }));
    localStorage.setItem("heika-theme", "dark");
  }, session);
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(BASE + "/?admin=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3600);
  try {
    await fn(page);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function nav(page, label) {
  await page.locator(".ab-sidebar button:visible").filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(1400);
}

async function row(page, title) {
  await page.locator(".ab-row:visible").filter({ has: page.locator(".ab-row__title", { hasText: new RegExp(`^${title}$`) }) }).first().click();
  await page.waitForTimeout(2000);
}

async function seg(page, aria, label) {
  const bar = page.locator(`[role="tablist"][aria-label="${aria}"]`).first();
  await bar.locator("button:visible").filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(1600);
}

/** 记录当前页所有折叠区的标题、是否展开、展开区内的条目数。 */
async function inspectFolds(page, pageName) {
  const info = await page.evaluate(() => {
    return [...document.querySelectorAll(".ab-fold")].map((el) => {
      const head = el.querySelector(".ab-fold__head");
      const body = el.querySelector(".ab-fold__body");
      const expanded = body ? body.getBoundingClientRect().height > 0 && getComputedStyle(body).display !== "none" : false;
      return {
        title: (head?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
        expanded,
        bodyRows: body ? body.querySelectorAll(".ab-row, .ab-item").length : 0,
        headHint: (head?.textContent || "").includes("展开") ? "含展开字样" : "",
      };
    });
  });
  report.folds.push({ page: pageName, folds: info });
  console.log(`[fold] ${pageName}`, JSON.stringify(info));
}

await withPage(async (page) => {
  // 1) 媒体服务 → 历史记录
  await nav(page, "监控");
  await row(page, "媒体服务");
  await seg(page, "媒体服务视图", "历史记录");
  await inspectFolds(page, "媒体服务/历史记录");
});

await withPage(async (page) => {
  // 2) 复审中心 → 已归档
  await nav(page, "审核");
  await row(page, "AI 审核中心");
  await seg(page, "审核栏目", "人工复审");
  await inspectFolds(page, "复审中心/人工复审");
});

await withPage(async (page) => {
  // 3) 任务中心 → 历史
  await nav(page, "监控");
  await row(page, "任务中心");
  await seg(page, "任务视图", "历史");
  await inspectFolds(page, "任务中心/历史");
});

await withPage(async (page) => {
  // 4) 系统告警
  await nav(page, "监控");
  await row(page, "系统告警");
  await seg(page, "告警筛选", "全部");
  await inspectFolds(page, "系统告警/全部");
});

await withPage(async (page) => {
  // 5) 资源管理列表 → 详情 → 返回，验证筛选与页码是否保留
  await nav(page, "监控");
  await row(page, "资源管理");
  await seg(page, "资源管理视图", "资源列表");
  // 设置筛选：切换到「孤立」
  const segs = page.locator('[role="tablist"][aria-label="引用状态"]').first();
  if (await segs.count()) {
    await segs.locator("button:visible").filter({ hasText: /^孤立/ }).first().click();
    await page.waitForTimeout(1800);
  }
  const before = await page.evaluate(() => ({
    rows: document.querySelectorAll("button.ab-item").length,
    text: (document.querySelector(".ab-toolbar")?.textContent || "").slice(0, 60),
  }));
  // 翻页
  const next = page.locator("button:visible").filter({ hasText: /^下一页$/ }).first();
  let paged = false;
  if (await next.count() && await next.isEnabled()) { await next.click(); await page.waitForTimeout(1400); paged = true; }
  const afterPage = await page.evaluate(() => document.querySelectorAll("button.ab-item").length);
  // 进详情
  await page.locator("button.ab-item").first().click();
  await page.waitForTimeout(2000);
  const detailShown = await page.evaluate(() => /资源详情|引用|返回资源列表/.test(document.body.innerText));
  // 返回
  const back = page.locator('button[aria-label="返回资源列表"]').first();
  if (await back.count()) { await back.click(); } else { await page.goBack(); }
  await page.waitForTimeout(1800);
  const after = await page.evaluate(() => ({
    rows: document.querySelectorAll("button.ab-item").length,
    text: (document.querySelector(".ab-toolbar")?.textContent || "").slice(0, 60),
  }));
  report.nav.push({ page: "资源列表→详情→返回", before, paged, afterPage, detailShown, after });
  console.log("[nav]", JSON.stringify(report.nav.at(-1)));
});

fs.writeFileSync("/tmp/fold-report.json", JSON.stringify(report, null, 1));
console.log("DONE");
