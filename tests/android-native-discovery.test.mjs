import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("native discovery uses a retained two-column list and bounded image caching", async () => {
  const screen = await read("android/app/src/main/java/com/heika/android/discovery/DiscoveryScreen.kt");
  const cache = await read("android/app/src/main/java/com/heika/android/discovery/DiscoveryCache.kt");
  const repository = await read("android/app/src/main/java/com/heika/android/discovery/DiscoveryRepository.kt");
  const models = await read("android/app/src/main/java/com/heika/android/discovery/DiscoveryModels.kt");

  assert.match(screen, /StaggeredGridLayoutManager\(2, RecyclerView\.VERTICAL\)/);
  assert.match(screen, /AsyncListDiffer/);
  assert.match(screen, /DiskCacheStrategy\.AUTOMATIC/);
  assert.match(screen, /stableKey/);
  assert.match(screen, /saveListState\(\)/);
  assert.match(screen, /ImageView\.ScaleType\.CENTER_CROP/);
  assert.match(cache, /MAX_AGE_MS = 24 \* 60 \* 60 \* 1000L/);
  assert.match(cache, /MAX_SNAPSHOTS = 16/);
  assert.match(models, /thumbnailImages/);
  assert.match(repository, /Authorization/);
  assert.match(repository, /fun close\(\) = cache\.close\(\)/);
  assert.match(repository, /86_400_000\.0/);
  assert.match(models, /Uri\.decode\(pathPart\)/);
});

test("native discovery overlays only the content and routes posts through the existing WebView", async () => {
  const activity = await read("android/app/src/main/java/com/heika/android/MainActivity.kt");
  const screen = await read("android/app/src/main/java/com/heika/android/discovery/DiscoveryScreen.kt");
  const bridge = await read("android/app/src/main/java/com/heika/android/NativeBridge.kt");
  const webBridge = await read("lib/native-bridge.ts");
  const community = await read("components/Community.tsx");

  assert.match(activity, /DiscoveryScreen\(/);
  assert.match(activity, /screen\.setNavigationCutout/);
  assert.match(activity, /screen\.bringToFront\(\)/);
  assert.match(activity, /discovery\.openPost/);
  assert.match(activity, /discovery\.interaction/);
  assert.match(screen, /interactionUpdates\.collect/);
  assert.match(bridge, /"discovery\.visibility" ->/);
  assert.match(webBridge, /composeLeftCss/);
  assert.match(community, /setNativeDiscoveryVisibility\(next\.visible, next\.top, next\.theme, next\.composeLeft/);
  assert.match(community, /hasNativeBridge\(\)\) return;/);
  assert.match(community, /openNativeAiPostRef\.current\(id, payload\.cloudId\)/);
  assert.match(community, /subscribeNativeEvent\("discovery\.interaction"/);
  assert.match(community, /savedFrom: saved \? \{ \.\.\.current\.savedFrom, \[id\]: "discover" \}/);
  assert.match(activity, /\.put\("channel", if \(channel == DiscoveryChannel\.AI\) "ai"/);
});

test("native AI discovery reuses the AI API and supports approved topic filtering", async () => {
  const repository = await read("android/app/src/main/java/com/heika/android/discovery/DiscoveryRepository.kt");
  const route = await read("app/api/v1/ai-space/route.ts");
  const gradle = await read("android/app/build.gradle.kts");
  const pkg = await read("package.json");

  assert.match(repository, /"\/api\/v1\/ai-space"/);
  assert.match(repository, /query\.topic\?\.let \{ params\["topic"\]/);
  assert.match(repository, /query\.category\?\.id/);
  assert.match(route, /if \(postId\) request = request\.eq\("id", postId\)/);
  assert.match(route, /post_topics\.interest_tags\.moderation_status/);
  assert.match(gradle, /applicationId = "com\.heika\.community"/);
  assert.match(gradle, /versionName = "2\.3\.6"/);
  assert.match(pkg, /"version": "2\.40\.7"/);
});

test("Android Actions builds the selected branch or pull request head, not the default branch", async () => {
  const workflow = await read(".github/workflows/android-apk.yml");

  assert.match(workflow, /inputs\.source_ref \|\| 'codex\/native-discovery-from-52'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.sha/);
  assert.doesNotMatch(workflow, /github\.event\.repository\.default_branch/);
});
