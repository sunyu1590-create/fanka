import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native Android startup targets the HEIKA API and APK workflow builds the current project", async () => {
  const gradleConfig = await readFile(new URL("../android-native/app/build.gradle.kts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/android-apk.yml", import.meta.url), "utf8");

  assert.match(gradleConfig, /API_BASE_URL".*https:\/\/moonclean\.shop/);
  assert.match(workflow, /-p android-native :app:lintDebug :app:testDebugUnitTest/);
  assert.match(workflow, /android-native\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.doesNotMatch(workflow, /-p android :app:/);
});
