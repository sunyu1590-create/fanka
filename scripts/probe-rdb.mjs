import fs from "node:fs";
import cloudbase from "@cloudbase/js-sdk/app";
import { registerAuth } from "@cloudbase/js-sdk/auth";
import { registerMySQL } from "@cloudbase/js-sdk/mysql";

registerAuth(cloudbase);
registerMySQL(cloudbase);

const key = fs.readFileSync("C:/Users/SunYu/WorkBuddy/Claw/.tmp/svc.key", "utf8").trim();
const orig = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const h = init.headers || {};
  const hdr = h instanceof Headers ? Object.fromEntries(h.entries()) : { ...h };
  const redacted = Object.fromEntries(
    Object.entries(hdr).map(([k, v]) => [k, /key|auth/i.test(k) ? `${String(v).slice(0, 12)}...(${String(v).length})` : v])
  );
  console.log("[REQ]", (init.method || "GET"), url, JSON.stringify(redacted));
  const res = await orig(input, init);
  console.log("[RES]", res.status, url);
  return res;
};

const app = cloudbase.init({ env: "heika-d6g93evt77a482544", accessKey: key, timeout: 20000 });
console.log("methods:", Object.keys(app).filter((k) => !k.startsWith("_")).join(", "));
for (const name of ["rdb", "database", "mysql"]) {
  try {
    const m = app[name];
    console.log(`app.${name}:`, typeof m);
    const inst = typeof m === "function" ? m.call(app) : m;
    console.log(`  -> instance keys:`, inst ? Object.keys(inst).slice(0, 12).join(", ") : inst);
    if (inst?.from) {
      const r = await inst.from("profiles").select("id").limit(1);
      console.log(`  rdb.from(profiles) =>`, JSON.stringify(r).slice(0, 300));
    }
  } catch (e) {
    console.log(`app.${name} error:`, e.message);
  }
}
