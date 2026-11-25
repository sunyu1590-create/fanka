import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const SID = "01916ee5-e519-4f86-ba64-c56cc761aab2";
const session = JSON.parse(readFileSync("/tmp/tok.json", "utf8"));
const auth = {
  access_token: session.access_token,
  token_type: "bearer",
  expires_in: session.expires_in,
  expires_at: Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
  refresh_token: session.refresh_token,
  user: session.user,
};

const OUT = "/tmp/qa";
mkdirSync(OUT, { recursive: true });
const CHROME = "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function newPage(viewport, { mobile = false, withAuth = false } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: "zh-CN",
    isMobile: mobile,
    hasTouch: mobile,
  });
  if (withAuth) {
    await context.addInitScript((payload) => {
      window.localStorage.setItem("sb-moonclean-auth-token", JSON.stringify(payload));
    }, auth);
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  return { context, page };
}

/** 新访客会被引导页拦住，先点「先随便看看」进入信息流。 */
async function enterHome(page) {
  const skip = page.locator(".onboarding-skip");
  if (await skip.count()) {
    await skip.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3500);
  }
}

async function shotHome(viewport, mobile, tag) {
  const { context, page } = await newPage(viewport, { mobile });
  await page.goto("https://moonclean.shop/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await enterHome(page);
  const frame = page.locator(".hb-carousel");
  const found = await frame.count();
  console.log(`[${tag}] carousel=${found}`);
  if (found) {
    await page.waitForTimeout(1200);
    const box = await frame.boundingBox();
    const dots = await page.locator(".hb-dots button").count();
    console.log(`[${tag}] box=${JSON.stringify(box)} dots=${dots}`);
    await page.screenshot({ path: `${OUT}/${tag}-home.png` });
    await frame.screenshot({ path: `${OUT}/${tag}-banner.png` });
    if (dots > 1) {
      await page.locator(".hb-dots button").first().click();
      await page.waitForTimeout(1600);
      await frame.screenshot({ path: `${OUT}/${tag}-banner-first.png` });
      await page.locator(".hb-dots button").nth(1).click();
      await page.waitForTimeout(1600);
      await frame.screenshot({ path: `${OUT}/${tag}-banner-second.png` });
    }
  }
  await context.close();
}

await shotHome({ width: 1440, height: 900 }, false, "desktop");
await shotHome({ width: 390, height: 844 }, true, "mobile");

// 封面编辑器
{
  const { context, page } = await newPage({ width: 430, height: 932 }, { mobile: true, withAuth: true });
  await page.goto(`https://moonclean.shop/series/${SID}/cover`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sce-page", { timeout: 30000 }).catch(() => console.log("编辑器未渲染"));
  await page.waitForTimeout(3500);
  console.log("编辑器标题:", await page.locator(".sce-title strong").textContent().catch(() => null));
  await page.screenshot({ path: `${OUT}/cover-auto.png` });
  const tabs = page.locator(".sce-tabs button");
  const tabCount = await tabs.count();
  console.log("来源 Tab 数量:", tabCount);
  for (let index = 0; index < tabCount; index += 1) {
    console.log(" tab", index, (await tabs.nth(index).textContent())?.trim());
  }
  if (tabCount) {
    await tabs.nth(1).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/cover-template.png` });
    const picks = page.locator(".sce-templates button");
    console.log("模板数量:", await picks.count());
    if (await picks.count()) {
      await picks.nth(2).click();
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `${OUT}/cover-picked.png` });
    }
    await page.locator(".sce-save").click();
    await page.waitForTimeout(3500);
    console.log("保存提示:", await page.locator(".sce-banner").first().textContent().catch(() => null));
    await page.screenshot({ path: `${OUT}/cover-saved.png` });
  }
  await context.close();
}

await browser.close();
console.log("done");
