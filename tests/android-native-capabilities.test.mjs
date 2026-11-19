import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const native = "android-native/app/src/main/java/com/heika/nativeapp";

test("native notification settings reflect Android permission state", async () => {
  const screen = await read(`${native}/feature/notifications/NotificationsScreen.kt`);
  const settings = await read(`${native}/feature/settings/SettingsScreen.kt`);

  assert.match(screen, /NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)/);
  assert.match(screen, /ActivityResultContracts\.RequestPermission\(\)/);
  assert.match(screen, /Settings\.ACTION_APP_NOTIFICATION_SETTINGS/);
  assert.match(screen, /import coil3\.compose\.AsyncImage/);
  assert.match(screen, /HeikaAlertDialog\(/);
  assert.match(settings, /NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)/);
});

test("native sharing and media selection use Android system interfaces", async () => {
  const app = await read(`${native}/ui/HeikaNativeApp.kt`);
  const publisher = await read(`${native}/feature/publish/PublishScreen.kt`);

  assert.match(app, /Intent\.ACTION_SEND/);
  assert.match(app, /Intent\.createChooser\(send, "分享内容"\)/);
  assert.match(app, /\?aiPost=\$\{post\.id\}&cloudId=/);
  assert.match(publisher, /PickMultipleVisualMedia\(\(9 - state\.images\.size\)\.coerceAtLeast\(1\)\)/);
  assert.match(publisher, /ActivityResultContracts\.PickVisualMedia\.ImageOnly/);
});

test("daily flip state survives page recreation in a user and date scoped Room row", async () => {
  const database = await read(`${native}/db/HeikaCacheDatabase.kt`);
  const viewModel = await read(`${native}/feature/home/HomeViewModel.kt`);

  assert.match(database, /@Entity\(tableName = "daily_state", primaryKeys = \["userId", "day"\]\)/);
  assert.match(database, /candidateIds: String[\s\S]*openedIds: String[\s\S]*openedPosts: String/);
  assert.match(viewModel, /repository\.dailyState\(userId, day\)/);
  assert.match(viewModel, /openedIds = opened/);
  assert.match(viewModel, /private suspend fun persist\(\)/);
});

test("native version metadata has a matching Chinese release entry", async () => {
  const gradle = await read("android-native/app/build.gradle.kts");
  const about = await read(`${native}/feature/settings/AboutScreen.kt`);
  const versionCode = Number(gradle.match(/versionCode = (\d+)/)?.[1]);
  const versionName = gradle.match(/versionName = "([^"]+)"/)?.[1];

  assert.ok(versionCode > 0);
  assert.ok(versionName);
  assert.match(about, new RegExp(`NativeRelease\\(${versionCode},`));
  assert.match(about, /认证|卡池|翻卡|通知/);
});
