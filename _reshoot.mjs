import fs from "node:fs";
import { chromium } from "playwright";
const session = JSON.parse(fs.readFileSync("/tmp/session.json", "utf8"));
const BASE = "https://moonclean.shop";
const OUT = "/tmp/shots-264";

async function run(name, fn) {
  const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript((s) => {
    localStorage.setItem("sb-moonclean-auth-token", JSON.stringify(s));
    localStorage.setItem("heika-demo-v1", JSON.stringify({ onboardingDone: true }));
    localStorage.setItem("heika-theme", "dark");
  }, session);
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(BASE + "/?admin=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3600);
  try { await fn(page); console.log("ok", name); } catch (e) { console.log("FAIL", name, String(e.message).split("\n")[0].slice(0, 100)); }
  await b.close();
}
const nav = async (page, label) => { await page.locator(".ab-sidebar button:visible").filter({ hasText: new RegExp(`^${label}`) }).first().click(); await page.waitForTimeout(1400); };
const row = async (page, title) => { await page.locator(".ab-row:visible").filter({ has: page.locator(".ab-row__title", { hasText: new RegExp(`^${title}$`) }) }).first().click(); await page.waitForTimeout(2200); };
const seg = async (page, aria, label) => { await page.locator(`[role="tablist"][aria-label="${aria}"]`).first().locator("button:visible").filter({ hasText: new RegExp(`^${label}`) }).first().click(); await page.waitForTimeout(1800); };

await run("d24", async (page) => {
  await nav(page, "审核"); await row(page, "批量任务");
  await page.screenshot({ path: `${OUT}/d24-batch-folded.png`, fullPage: true });
});
