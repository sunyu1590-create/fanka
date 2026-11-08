import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Android startup always targets the domestic-friendly HEIKA domain", async () => {
  const gradleConfig = await readFile(new URL("../android/app/build.gradle.kts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/android-apk.yml", import.meta.url), "utf8");

  assert.match(gradleConfig, /URI\("https:\/\/moonclean\.shop\/"\)/);
  assert.doesNotMatch(gradleConfig, /gradleProperty\("heikaWebUrl"\)/);
  assert.doesNotMatch(workflow, /HEIKA_WEB_URL|heikaWebUrl/);
});
