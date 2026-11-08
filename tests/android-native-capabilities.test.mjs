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
