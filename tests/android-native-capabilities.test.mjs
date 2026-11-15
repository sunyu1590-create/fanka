import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const native = (path) => `native-android/app/src/main/java/com/heika/nativeapp/${path}`;

test("Native Android notification settings reflect OS permission and sync account preferences", async () => {
  const settings = await read(native("feature/settings/SettingsScreen.kt"));
  const repository = await read(native("data/HeikaRepository.kt"));
  assert.match(settings, /NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)/);
  assert.match(settings, /Settings\.ACTION_APP_NOTIFICATION_SETTINGS/);
  assert.match(settings, /此开关与网站账号偏好同步/);
  assert.match(repository, /\/api\/v1\/settings\/notifications/);
});

test("Native sharing and image selection use Android system UI", async () => {
  const app = await read(native("ui/HeikaNativeApp.kt"));
  const publish = await read(native("feature/publish/PublishScreen.kt"));
  assert.match(app, /Intent\.createChooser\(send, "分享内容"\)/);
  assert.match(publish, /ActivityResultContracts\.PickVisualMedia\(\)/);
  assert.match(publish, /PickMultipleVisualMedia\(\(9 - state\.images\.size\)/);
});

test("Native About screen shows the installed version and current release history", async () => {
  const about = await read(native("feature/settings/AboutScreen.kt"));
  const app = await read(native("ui/HeikaNativeApp.kt"));
  assert.match(about, /installedVersion\(context\)/);
  assert.match(about, /BuildConfig\.API_BASE_URL/);
  assert.match(about, /NativeRelease\(40, "2026\.11\.15"/);
  assert.match(app, /AboutScreen\(/);
  assert.doesNotMatch(about, /版本 1\.44|版本 2\.2\.3/);
});

test("Native Android build uses the current HEIKA Native release identity", async () => {
  const gradle = await read("native-android/app/build.gradle.kts");
  const manifest = await read("native-android/app/src/main/AndroidManifest.xml");
  assert.match(gradle, /versionCode = 40/);
  assert.match(gradle, /versionName = "2\.3\.6"/);
  assert.match(manifest, /android:name="\.MainActivity"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});
