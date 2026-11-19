import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical Android client uses the current HTTPS API host", async () => {
  const gradle = await read("android-native/app/build.gradle.kts");
  const repository = await read("android-native/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");

  assert.match(gradle, /API_BASE_URL/);
  assert.match(gradle, /https:\/\/moonclean\.shop/);
  assert.match(repository, /API_BASE_URL/);
  assert.doesNotMatch(gradle, /vercel\.app/);
  assert.doesNotMatch(repository, /vercel\.app/);
});

test("card-to-detail shared transitions remain enabled in Native 3.0", async () => {
  const app = await read("android-native/app/src/main/java/com/heika/nativeapp/ui/HeikaNativeApp.kt");
  const home = await read("android-native/app/src/main/java/com/heika/nativeapp/feature/home/HomeScreen.kt");
  const detail = await read("android-native/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailScreen.kt");

  assert.match(app, /SharedTransitionLayout/);
  assert.match(app, /pageTransition == "shared"/);
  assert.match(home, /heikaSharedPostImage/);
  assert.match(detail, /heikaSharedPostImage/);
  assert.match(detail, /HeikaDropdownFade\(visible = moreOpen\)/);
});
