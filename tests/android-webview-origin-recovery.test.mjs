import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Android trusts the canonical and documented HEIKA web origins", async () => {
  const gradle = await readFile(new URL("../android/app/build.gradle.kts", import.meta.url), "utf8");
  const activity = await readFile(new URL("../android/app/src/main/java/com/heika/android/MainActivity.kt", import.meta.url), "utf8");
  const bridge = await readFile(new URL("../android/app/src/main/java/com/heika/android/NativeBridge.kt", import.meta.url), "utf8");

  assert.match(gradle, /WEB_APP_HOSTS.*moonclean\.shop,www\.moonclean\.shop,fanka-two\.vercel\.app/);
  assert.match(activity, /uri\.userInfo == null && trustedOrigins\.any/);
  assert.match(bridge, /trustedOrigins\.mapTo\(LinkedHashSet\(\), ::originString\)/);
});

test("a committed HEIKA page cannot remain behind the loading mask waiting forever for JS bridge readiness", async () => {
  const activity = await readFile(new URL("../android/app/src/main/java/com/heika/android/MainActivity.kt", import.meta.url), "utf8");

  assert.match(activity, /const val BRIDGE_READY_TIMEOUT_MS = 2_000L/);
  assert.match(activity, /webContentCommitted && bridge\?\.isReady\(\) != true/);
  assert.match(activity, /diagnostics\.record\("web_bridge_ready_timeout"\)/);
  assert.match(activity, /diagnostics\.record\("web_main_frame_http_error", errorResponse\.statusCode\.toLong\(\)\)/);
});
