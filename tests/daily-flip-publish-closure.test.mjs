import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("daily flips are server-authoritative, account/day locked, and idempotent", async () => {
  const migration = await read("supabase/migrations/20261110060552_authoritative_daily_flip.sql");
  const route = await read("app/api/v1/library-state/route.ts");
  const nativeRepository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const nativeLogic = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/home/DailyDeckLogic.kt");

  assert.match(migration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(v_user::text \|\| ':' \|\| v_today::text, 0\)\)/);
  assert.match(migration, /primary key \(user_id, local_date, post_id\)/);
  assert.match(migration, /unique \(user_id, local_date, idempotency_key\)/);
  assert.match(migration, /daily_flip_limit_reached/);
  assert.match(migration, /when v_roll < 0\.001 then 10[\s\S]*when v_roll < 0\.016 then 5[\s\S]*when v_roll < 0\.066 then 3[\s\S]*when v_roll < 0\.166 then 2/);
  assert.doesNotMatch(migration, /p_legacy_bonus/);
  assert.match(migration, /revoke all on private\.daily_flip_days, private\.daily_flip_attempts from public, anon, authenticated/);
  assert.match(migration, /revoke insert, update on public\.user_interactions from authenticated/);
  assert.doesNotMatch(migration, /grant (?:insert|update)\s*\([^)]*opened_at/);
  assert.match(route, /action === "flip" \|\| action === "open"/);
  assert.match(route, /db\.rpc\("confirm_daily_flip"/);
  assert.match(nativeRepository, /DailyDeckLogic\.flipIdempotencyKey\(day, clientId\)/);
  assert.match(nativeLogic, /return "flip:\$day:\$postId"/);
});

test("image upload retries reuse upload_id and published media cannot be deleted as draft media", async () => {
  const mediaRoute = await read("app/api/v1/media/route.ts");
  const viewModel = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishViewModel.kt");
  const repository = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");

  assert.match(mediaRoute, /if \(linked\?\.post_id === postId && linked\.thumbnail_path && linked\.retina_thumbnail_path\)/);
  assert.match(mediaRoute, /linkedPost\?\.status === "published"/);
  assert.match(mediaRoute, /const stagingMode = !revisionMode && !form\.has\("post_id"\) && form\.get\("staging"\) === "1"/);
  assert.match(mediaRoute, /if \(stagingMode\) return \{ path: paths\.original[\s\S]*staged: true \}/);
  assert.match(viewModel, /val uploadId = UUID\.randomUUID\(\)\.toString\(\)/);
  assert.match(viewModel, /uploadId = image\.uploadId!!,[\s\S]*fileName = image\.name,[\s\S]*mimeType = image\.mime!!/);
  assert.match(viewModel, /FileOutputStream\(temporaryFile\)[\s\S]*output\.fd\.sync\(\)[\s\S]*temporaryFile\.renameTo\(localFile\)/);
  assert.match(viewModel, /fun retryUpload\(key: String\)/);
  assert.match(viewModel, /native-publish|saveLocalPublishSnapshot/);
  assert.match(repository, /addFormDataPart\("upload_id", uploadId\)/);
  assert.match(repository, /if \(revisionMode\)[\s\S]*addFormDataPart\("revision_post_id"/);
  assert.match(repository, /if \(postId\.isNullOrBlank\(\)\)[\s\S]*addFormDataPart\("staging", "1"\)/);
  assert.match(viewModel, /uploadJob\?\.join\(\)/);
  assert.match(viewModel, /val orphanRetryPath = if \(removed\?\.uploadId != null/);
});

test("publish drafts keep ordered media paths and distinguish revision submission", async () => {
  const viewModel = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishViewModel.kt");
  const screen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/publish/PublishScreen.kt");
  const libraryRoute = await read("app/api/v1/library-state/route.ts");
  const mediaRoute = await read("app/api/v1/media/route.ts");

  assert.match(viewModel, /images = images, mediaPaths = images\.mapNotNull\(PendingImage::path\)/);
  assert.match(viewModel, /serverStatus = post\.optString\("status"\)/);
  assert.match(viewModel, /private suspend fun submitContent\(current: PublishState\)/);
  assert.doesNotMatch(viewModel, /ensureDraft\(|saveRemoteDraft\(|repository\.createOrUpdateDraft\(/);
  assert.match(viewModel, /current\.images\.filter \{ it\.path == null \}\.forEach \{ image ->[\s\S]*?if \(mutableState\.value\.images\.firstOrNull \{ it\.key == image\.key \}\?\.path == null\) uploadPendingImage\(image\.key\)/);
  assert.match(viewModel, /修改已提交审核，原作品保持发布/);
  assert.match(screen, /viewModel\.setCover\(image\.key\)/);
  assert.match(screen, /viewModel\.retryUpload\(image\.key\)/);
  assert.match(libraryRoute, /existingPost\?\.data\?\.status === "published"/);
  assert.match(libraryRoute, /post_revisions/);
  assert.match(viewModel, /repository\.localPublishSnapshot\(session\.userId, mutableState\.value\.channel\)/);
  assert.match(viewModel, /repository\.saveLocalPublishSnapshot\(accountId, snapshot, current\.channel\)/);
  assert.match(viewModel, /fun deleteLocalDraft\(\)[\s\S]*clearLocalPublishSnapshot/);
  assert.match(viewModel, /private suspend fun saveDraftInternal[\s\S]*persistLocalSnapshot\(\)/);
  assert.doesNotMatch(viewModel, /repository\.createOrUpdateDraft\(/);
  assert.match(screen, /if \(image\.error != null\)[\s\S]*重试上传/);
  assert.match(mediaRoute, /if \(revisionMode\) return \{ path: paths\.original/);
  assert.match(libraryRoute, /signPostMedia\(db, mediaPaths, 60\)/);
});
