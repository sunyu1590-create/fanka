import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Android notification center reuses the authenticated notification and preference APIs", async () => {
  const center = await read("android/app/src/main/java/com/heika/android/NativeNotifications.kt");
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const route = await read("app/api/v1/notifications/route.ts");
  const settings = await read("app/api/v1/settings/notifications/route.ts");

  assert.match(center, /\/api\/v1\/notifications\?page=1&limit=30/);
  assert.match(center, /\/api\/v1\/settings\/notifications/);
  assert.match(center, /Authorization.*Bearer/);
  assert.match(center, /"read_all"/);
  assert.match(center, /"read"/);
  assert.doesNotMatch(center, /"delete"/);
  assert.match(route, /body\.action === "read_all"/);
  assert.match(route, /body\.action === "read"/);
  assert.match(settings, /notification_comments_enabled/);
  assert.match(activity, /showNativeNotificationCenter/);
  assert.match(activity, /closeNativeNotificationCenter/);
  assert.match(activity, /normalizeBusinessRoute\(payload\.optString\("route"\)\)/);
});

test("Android notification permission, channel, app metadata, and local message routing are native", async () => {
  const app = await read("android/app/src/main/java/com/heika/android/HeikaApplication.kt");
  const manifest = await read("android/app/src/main/AndroidManifest.xml");
  const bridge = await read("android/app/src/main/java/com/heika/android/NativeBridge.kt");
  const inbox = await read("components/InboxBadge.tsx");
  const gradle = await read("android/app/build.gradle.kts");

  assert.match(manifest, /POST_NOTIFICATIONS/);
  assert.match(app, /NotificationChannel\(/);
  assert.match(app, /heika_messages_v1/);
  assert.match(bridge, /app\.versionName/);
  assert.match(bridge, /notifications\.center\.open/);
  assert.match(bridge, /notifications\.show/);
  assert.match(inbox, /showNativeNotification\(/);
  assert.match(inbox, /document\.visibilityState === "visible"/);
  assert.match(gradle, /versionName = "2\.3\.6"/);
  assert.match(gradle, /versionCode = 11/);
});

test("Android About returns to the shared web layout and reads its installed version from native config", async () => {
  const about = await read("components/AboutHeika.tsx");
  const community = await read("components/Community.tsx");
  const bridge = await read("lib/native-bridge.ts");
  const gradle = await read("android/app/build.gradle.kts");

  assert.match(about, /getNativeAppInfo\(\)/);
  assert.match(about, /appInfo\.versionName/);
  assert.match(about, /appInfo\.versionCode/);
  assert.match(about, /appInfo\.github/);
  assert.match(community, /const openAboutPage = \(\) => \{[\s\S]*?setTab\("about"\)/);
  assert.doesNotMatch(community, /const openAboutPage = \(\) => \{\s*if \(hasNativeBridge\(\)\) \{\s*void openNativeAbout/);
  assert.match(bridge, /app\.versionCode/);
  assert.match(gradle, /versionName = "2\.3\.6"/);
});
