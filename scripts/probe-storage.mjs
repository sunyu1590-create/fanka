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
try {
  const st = app.storage;
  const r = await st.from("heika-private").list("ai");
  console.log("list =>", JSON.stringify(r).slice(0, 300));
} catch (e) {
  console.log("storage error:", e.message.slice(0, 200));
}
console.log(log.join("\n"));
