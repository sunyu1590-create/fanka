import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Native 3 routes core business destinations to Compose screens", async () => {
  const resolver = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/navigation/DestinationResolver.kt");
  const app = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaNativeApp.kt");
  for (const destination of ["PostDetailScreen", "ProfileScreen", "MessagesScreen", "PublishScreen", "SearchScreen", "SettingsScreen", "MembershipScreen", "FeedbackScreen"]) {
    assert.match(app, new RegExp(`${destination}\\(`));
  }
  assert.match(resolver, /native\("post\/\$\{key\}", "community_post"\)/);
  assert.match(resolver, /native\("new-conversation\/\$\{destination\.userId\.lowercase\(\)\}", "new_conversation"\)/);
  assert.doesNotMatch(app, /CompatWebScreen|DestinationTarget\.Compatibility/);
});

test("Native direct messages use existing database RPCs and read receipts", async () => {
  const route = await read("app/api/v1/messages/route.ts");
  const screen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/messages/MessagesScreen.kt");
  assert.match(route, /db\.rpc\("dm_inbox_summary"\)/);
  assert.match(route, /db\.rpc\("open_dm"/);
  assert.match(route, /db\.rpc\("send_dm"/);
  assert.match(route, /from\("dm_reads"\)\.upsert/);
  assert.match(screen, /viewModel\.refreshActive\(\)/);
  assert.match(screen, /initialPeerId/);
});

test("Native publishing restores private draft media from the authenticated API", async () => {
  const route = await read("app/api/v1/library-state/route.ts");
  const screen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishScreen.kt");
  const viewModel = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishViewModel.kt");
  assert.match(route, /mediaPathsByPostId = new Map/);
  assert.match(route, /post\.cloudId \? \{ mediaPaths: mediaPathsByPostId\.get\(post\.cloudId\)/);
  assert.match(viewModel, /repository\.myLibraryState\(\)/);
  assert.match(viewModel, /images = paths\.mapIndexed/);
  assert.match(screen, /PickMultipleVisualMedia/);
  assert.match(screen, /viewModel\.moveImage/);
  assert.match(viewModel, /post\.optString\("status"\) == "published"/);
});
