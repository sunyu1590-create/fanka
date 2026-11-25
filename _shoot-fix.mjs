import fs from "node:fs";
import { chromium } from "playwright";

const session = JSON.parse(fs.readFileSync("/tmp/session.json", "utf8"));
const BASE = "https://moonclean.shop";
const OUT = "/tmp/shots-264";
fs.mkdirSync(OUT, { recursive: true });

const fails = [];
const taken = [];

async function scenario(name, opts, fn) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--max-old-space-size=512"],
  });
  const mobile = Boolean(opts.mobile);
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
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
  }, [session, opts.theme]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(BASE + "/?admin=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3600);
  try {
    await fn(page);
  } catch (error) {
    fails.push(`${name}: ${String(error.message || error).split("\n")[0].slice(0, 120)}`);
  }
  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
}

async function shot(page, name, full = true) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  taken.push(name);
  console.log("ok", name);
}

/** 一级导航：桌面点侧栏，手机点底部。 */
async function nav(page, label, mobile) {
  const re = new RegExp(`^${label}`);
  if (mobile) {
    await page.locator(".ab-bottomnav button:visible, .ab-bottomnav a:visible").filter({ hasText: re }).first().click();
  } else {
    await page.locator(".ab-sidebar button:visible").filter({ hasText: re }).first().click();
  }
  await page.waitForTimeout(1500);
}

/** hub 行：只比对标题，避免描述文案误命中。 */
async function row(page, title) {
  await page.locator(".ab-row:visible").filter({ has: page.locator(".ab-row__title", { hasText: new RegExp(`^${title}$`) }) }).first().click();
  await page.waitForTimeout(2200);
}

async function seg(page, aria, label) {
  const bar = page.locator(`[role="tablist"][aria-label="${aria}"]`).first();
  await bar.locator("button:visible").filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(1800);
}

// ---------- 桌面 深色 补拍 ----------
await scenario("d15", { theme: "dark" }, async (page) => {
  await nav(page, "审核", false);
  await row(page, "AI 审核中心");
  await seg(page, "审核栏目", "人工复审");
  await page.locator("button:visible").filter({ hasText: /^选择记录$/ }).first().click();
  await page.waitForTimeout(1000);
  await shot(page, "d15-review-select-mode");
});

await scenario("d16", { theme: "dark" }, async (page) => {
  await nav(page, "审核", false);
  await row(page, "AI 审核中心");
  await seg(page, "审核栏目", "人工复审");
  await page.locator("button:visible").filter({ hasText: /^选择记录$/ }).first().click();
  await page.waitForTimeout(900);
  const box = page.locator('input[type="checkbox"]:visible').first();
  if (await box.count()) { await box.click(); await page.waitForTimeout(700); }
  await page.locator("button:visible").filter({ hasText: /清理所选/ }).first().click();
  await page.waitForTimeout(1400);
  await shot(page, "d16-review-cleanup-dialog", false);
  const cancel = page.locator("button:visible").filter({ hasText: /^取消$/ }).first();
  if (await cancel.count()) { await cancel.click(); }
});

await scenario("d19", { theme: "dark" }, async (page) => {
  await nav(page, "监控", false);
  await row(page, "进程监控");
  await shot(page, "d19-processes");
});

await scenario("d20", { theme: "dark" }, async (page) => {
  await nav(page, "管理", false);
  await shot(page, "d20-hub-manage");
  await row(page, "运营成本");
  await shot(page, "d21-cost");
});

await scenario("d22", { theme: "dark" }, async (page) => {
  await nav(page, "监控", false);
  await row(page, "系统告警");
  await shot(page, "d22-alerts");
});

await scenario("d23", { theme: "dark" }, async (page) => {
  await nav(page, "监控", false);
  await row(page, "资源管理");
  await shot(page, "d23-resources-direct");
});

// ---------- 手机 深色 补拍 ----------
await scenario("m07", { theme: "dark", mobile: true }, async (page) => {
  await nav(page, "审核", true);
  await row(page, "AI 审核中心");
  await seg(page, "审核栏目", "人工复审");
  await shot(page, "m07-review-center");
});

await scenario("m08", { theme: "dark", mobile: true }, async (page) => {
  await nav(page, "监控", true);
  await row(page, "任务中心");
  await shot(page, "m08-task-center");
});

await scenario("m09", { theme: "dark", mobile: true }, async (page) => {
  await nav(page, "监控", true);
  await row(page, "进程监控");
  await shot(page, "m09-processes");
});

await scenario("m10", { theme: "dark", mobile: true }, async (page) => {
  await nav(page, "管理", true);
  await row(page, "运营成本");
  await shot(page, "m10-cost");
});

// ---------- 手机 浅色 补拍 ----------
await scenario("n04", { theme: "light", mobile: true }, async (page) => {
  await nav(page, "审核", true);
  await row(page, "AI 审核中心");
  await seg(page, "审核栏目", "人工复审");
  await shot(page, "n04-review-center");
});

console.log("TAKEN", taken.length);
console.log("FAILS", fails.length);
for (const f of fails) console.log(" !", f);
