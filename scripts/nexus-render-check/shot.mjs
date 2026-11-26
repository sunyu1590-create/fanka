import { firefox } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/workspace/nexus-2.0-shots";
mkdirSync(OUT, { recursive: true });

const scenes = [
  ["overview", {}],
  ["globe", {}],
  ["server", {}],
  ["server", { explode: true, suffix: "-explode" }],
  ["storage", {}],
  ["ai", {}],
  ["content", {}],
  ["security", {}],
  ["timeline", {}],
];

const browser = await firefox.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
page.on("console", (message) => { if (message.type() === "error") console.log("CONSOLE", message.text()); });

await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "load" });
await page.waitForFunction(() => Boolean(window.nexusShot), null, { timeout: 30_000 });

const webgl = await page.evaluate(() => {
  const canvas = document.getElementById("view");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  return gl ? gl.getParameter(gl.VERSION) : "none";
});
console.log("WEBGL", webgl);

for (const [scene, options] of scenes) {
  const name = options.suffix ? `${scene}${options.suffix}` : scene;
  await page.evaluate(([key, opts]) => window.nexusShot.show(key, opts), [scene, options]);
  await page.waitForTimeout(1900);
  const stats = await page.evaluate(() => window.nexusShot.stats());
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, JSON.stringify(stats));
}

await page.evaluate(() => window.nexusShot.boot("light"));
for (const [scene, options] of [["overview", {}], ["security", {}], ["server", {}]]) {
  const name = `light-${scene}`;
  await page.evaluate(([key, opts]) => window.nexusShot.show(key, opts), [scene, options]);
  await page.waitForTimeout(1900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}

await browser.close();
console.log("DONE");
