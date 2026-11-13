import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI resource catalog keeps six stable resource ids and separate multi-valued scenarios", async () => {
  const migration = await read("supabase/migrations/20261113133929_ai_resource_catalog_and_scenarios.sql");
  const route = await read("app/api/v1/ai-space/route.ts");
  const typeRules = await read("lib/ai-resources.ts");
  const nativeRules = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/AiResourceRules.kt");
  for (const id of ["agent", "skill", "prompt", "ai_tool", "knowledge_article", "tutorial"]) {
    assert.match(migration, new RegExp(`'${id}'`));
    assert.match(typeRules, new RegExp(`"${id}"`));
  }
  for (const scenario of ["learning", "programming", "writing", "office", "creation", "life"]) {
    assert.match(migration, new RegExp(`'${scenario}'`));
    assert.match(route, new RegExp(`"${scenario}"`));
    assert.match(nativeRules, new RegExp(`"${scenario}"`));
  }
  assert.match(route, /request\.overlaps\("usage_scenarios", \[scenario\]\)/);
  assert.match(route, /request\.or\(`title\.ilike\.%\$\{queryText\}%,body\.ilike\.%\$\{queryText\}%`\)/);
  assert.match(migration, /add column if not exists usage_scenarios text\[\] not null default '\{\}'/);
  assert.match(migration, /apply_ai_post_revision[\s\S]*usage_scenarios = target_scenarios/);
});

test("AI resource center routes reuse paged AI feed cards and preserve scenario filters", async () => {
  const app = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaNativeApp.kt");
  const screens = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/discovery/AiResourceScreens.kt");
  const viewModel = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/discovery/DiscoveryViewModel.kt");
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  assert.match(app, /composable\("ai-resources"\)/);
  assert.match(app, /ai-resources\/type\/{type}/);
  assert.match(app, /ai-resources\/search\?type=\{type\}/);
  assert.match(screens, /FeedGrid\(/);
  assert.match(screens, /PullToRefreshBox/);
  assert.match(screens, /全部场景/);
  assert.match(screens, /"programming" to "编程"/);
  assert.match(viewModel, /NativeDiscoveryPagingSource\(repository, current/);
  assert.match(repository, /append\("&scenario=\$\{encode\(it\)\}"\)/);
  assert.match(repository, /append\("&q=\$\{encode\(it\.take\(60\)\)\}"\)/);
  assert.match(repository, /filter\.usageScenario\.orEmpty\(\)/);
  assert.match(repository, /filter\.query\.orEmpty\(\)/);
});

test("AI usage scenarios round trip through local drafts, publishing, moderation and history", async () => {
  const publishVm = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishViewModel.kt");
  const publishUi = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishScreen.kt");
  const library = await read("lib/server/library.ts");
  const adminList = await read("app/api/v1/admin/ai-space/route.ts");
  const adminItem = await read("app/api/v1/admin/ai-space/[id]/route.ts");
  const typeAdmin = await read("app/api/v1/admin/ai-resource-types/route.ts");
  assert.match(publishUi, /使用场景 · 可多选/);
  assert.match(publishVm, /put\("usageScenarios", JSONArray\(current\.usageScenarios\)\)/);
  assert.match(publishVm, /usageScenarios = source\.stringList\("usageScenarios"\)/);
  assert.match(publishVm, /usageScenarios = current\.usageScenarios/);
  assert.match(library, /usageScenarios: row\.usage_scenarios \|\| \[\]/);
  assert.match(adminList, /usageScenarios: post\.usage_scenarios/);
  assert.match(adminList, /payload\.usageScenarios/);
  assert.match(adminItem, /body\.action === "classify"/);
  assert.match(adminItem, /revision_updated: true/);
  assert.match(typeAdmin, /requirePermission\(req, "ai.review"\)/);
  assert.match(typeAdmin, /recordModerationAudit/);
});
