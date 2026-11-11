import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("privacy API scopes all records to the authenticated caller and uses only caller JWT RLS", async () => {
  const route = await read("app/api/v1/me/privacy/route.ts");
  assert.match(route, /context\(req\)/);
  assert.match(route, /eq\("owner_id", user!\.id\)/);
  assert.match(route, /eq\("user_id", user!\.id\)/);
  assert.match(route, /eq\("id", user!\.id\)/);
  assert.doesNotMatch(route, /adminClient|service_role|SUPABASE_SERVICE_ROLE/);
});

test("native detail actions keep post and comment UUIDs separate from numeric interaction IDs", async () => {
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const detail = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailViewModel.kt");
  assert.match(repository, /put\("comment_id", commentId\)/);
  assert.match(repository, /put\("post_id", postId\)/);
  assert.match(repository, /fun deleteComment\(commentId: String\)/);
  assert.match(detail, /repository\.muteRecommendationAuthor\(authorId\)/);
  assert.match(detail, /repository\.reportPost\("", reason, note, commentId\)/);
  assert.match(detail, /post\.id <= 0/);
  assert.match(repository, /suspend fun deletePost\(postId: String\)[\s\S]*?require\(isUuid\(postId\)\)[\s\S]*?\/api\/v1\/posts\/\$\{encode\(postId\)\}.*method = "DELETE"/);
  assert.match(detail, /post\.authorId != mutableState\.value\.currentUserId/);
});

test("detail shared image remains a shared element and content text has no staggered entry", async () => {
  const shared = await read("native-android/app/src/main/java/com/heika/nativeapp/ui/HeikaSharedImage.kt");
  const detail = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/detail/PostDetailScreen.kt");
  assert.match(shared, /sharedElement\(/);
  assert.match(shared, /post-image-\$postKey/);
  assert.doesNotMatch(detail, /titleShown|authorShown|bodyShown/);
});
