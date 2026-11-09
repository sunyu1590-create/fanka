import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Android notification status and settings use the actual OS state", async () => {
  const bridge = await read("android/app/src/main/java/com/heika/android/NativeBridge.kt");
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const webBridge = await read("lib/native-bridge.ts");

  assert.match(bridge, /"notifications\.status" -> callbacks\.onNotificationStatusRequest/);
  assert.match(bridge, /"notifications\.openSettings" -> callbacks\.onNotificationSettingsRequest/);
  assert.match(activity, /NotificationManagerCompat\.from\(this@MainActivity\)\.areNotificationsEnabled\(\)/);
  assert.match(activity, /Settings\.ACTION_APP_NOTIFICATION_SETTINGS/);
  assert.match(webBridge, /getNativeNotificationStatus/);
  assert.match(webBridge, /openNativeNotificationSettings/);
});

test("native sharing and image selection use Android system UI", async () => {
  const bridge = await read("android/app/src/main/java/com/heika/android/NativeBridge.kt");
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const webBridge = await read("lib/native-bridge.ts");
  const inbox = await read("components/InboxBadge.tsx");

  assert.match(bridge, /"system\.share" ->/);
  assert.match(activity, /Intent\.createChooser\(intent, "分享黑卡内容"\)/);
  assert.match(webBridge, /shareViaNative/);
  assert.match(activity, /ActivityResultContracts\.PickVisualMedia\(\)/);
  assert.match(activity, /PickMultipleVisualMedia\(9\)/);
  assert.match(inbox, /!hasNativeBridge\(\)[\s\S]*?Notification\.permission/);
});

test("Android exposes the existing today deck as a launcher shortcut", async () => {
  const manifest = await read("android/app/src/main/AndroidManifest.xml");
  const shortcuts = await read("android/app/src/main/res/xml/shortcuts.xml");

  assert.match(manifest, /android\.app\.shortcuts/);
  assert.match(shortcuts, /android:shortcutId="today_flip"/);
  assert.match(shortcuts, /android:data="https:\/\/moonclean\.shop\/"/);
});

test("Android About uses the shared website layout and browser keeps the same About page", async () => {
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const community = await read("components/Community.tsx");
  const webAbout = await read("components/AboutHeika.tsx");

  assert.match(activity, /BuildConfig\.VERSION_NAME/);
  assert.match(community, /const openAboutPage = \(\) => \{[\s\S]*?setTab\("about"\)/);
  assert.match(webAbout, /import \{ APP_VERSION \} from "@\/lib\/version"/);
  assert.match(webAbout, /VERSION \{appInfo\?\.versionName \|\| APP_VERSION\}/);
  assert.match(webAbout, /appInfo\.versionCode/);
  assert.doesNotMatch(community, /openNativeAbout/);
});

test("Android internal notification preferences do not depend on OS permission", async () => {
  const community = await read("components/Community.tsx");
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const settings = await read("components/NotificationSettings.tsx");

  assert.match(community, /notifications: \{ \.\.\.s\.notifications, \[key\]: !s\.notifications\[key\] \}/);
  assert.match(community, /申请系统通知权限/);
  assert.match(settings, /getNativeNotificationStatus/);
  assert.match(settings, /requestNativeNotificationPermission/);
  assert.match(settings, /openNativeNotificationSettings/);
  assert.match(settings, /黑卡消息开关控制/);
  assert.match(activity, /NotificationManagerCompat\.from\(this@MainActivity\)\.areNotificationsEnabled\(\)/);
});

test("Android app upgrade refreshes only web resource and public content caches", async () => {
  const gradle = await read("android/app/build.gradle.kts");
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const cache = await read("lib/public-content-cache.ts");

  assert.match(gradle, /versionCode = 11/);
  assert.match(gradle, /versionName = "2\.3\.6"/);
  assert.match(activity, /view\.clearCache\(true\)/);
  assert.match(activity, /preserving cookies, localStorage, drafts, and account state/);
  assert.match(cache, /heika-public-content-v2/);
  assert.match(cache, /indexedDB\.deleteDatabase\(name\)/);
});
