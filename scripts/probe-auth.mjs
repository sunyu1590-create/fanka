import fs from "node:fs";
import cloudbase from "@cloudbase/js-sdk/app";
import { registerAuth } from "@cloudbase/js-sdk/auth";
import { registerStorage } from "@cloudbase/js-sdk/storage";

registerAuth(cloudbase);
registerStorage(cloudbase);

const key = fs.readFileSync("C:/Users/SunYu/WorkBuddy/Claw/.tmp/svc.key", "utf8").trim();
const orig = globalThis.fetch;
const log = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  log.push(`[${(init.method || "GET").toUpperCase()}] ${url}`);
  const res = await orig(input, init);
  log.push(`   -> ${res.status}`);
  return res;
};

const app = cloudbase.init({ env: "heika-d6g93evt77a482544", accessKey: key, timeout: 20000 });
const auth = app.auth();
console.log("auth methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(auth)).join(", "));

const attempts = [
  ["signInWithPassword", () => auth.signInWithPassword({ email: "probe@example.com", password: "Probe123456" })],
  ["signUp", () => auth.signUp({ email: "probe@example.com", password: "Probe123456" })],
  ["getSession", () => auth.getSession()],
  ["signInAnonymously", () => auth.signInAnonymously?.()],
];
for (const [name, fn] of attempts) {
  try {
    const r = await fn();
    console.log(`${name} =>`, JSON.stringify(r).slice(0, 250));
  } catch (e) {
    console.log(`${name} threw:`, String(e.message).slice(0, 200));
  }
}
console.log("--- 请求轨迹 ---");
console.log(log.join("\n"));
