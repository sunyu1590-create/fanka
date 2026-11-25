import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; PGT-AN20 Build/HONORPGT-AN20; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
await page.goto("https://moonclean.shop/?admin=1", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => ({
  title: document.title,
  hasAdminShell: Boolean(document.querySelector(".admin-shell, .ab-layout")),
  bodyLen: document.body.innerText.trim().length,
  head: document.body.innerText.trim().slice(0, 80).replace(/\n/g, " "),
  buttons: document.body.innerText.includes("登录") ? "含登录" : "无登录",
}));
console.log(JSON.stringify({ info, errs }, null, 1));
await page.screenshot({ path: "/tmp/app-entry.png" });
await b.close();
