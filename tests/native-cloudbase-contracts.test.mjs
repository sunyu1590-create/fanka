import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Native Android authentication is backed by the CloudBase gateway and HEIKA auth APIs", async () => {
  const [auth, config] = await Promise.all([
    source("../native-android/app/src/main/java/com/heika/nativeapp/auth/AuthRepository.kt"),
    source("../app/api/client-config/route.ts"),
  ]);
  assert.match(config, /\{\s*gateway\s*\}/);
  assert.match(auth, /\/auth\/v1\/signin/);
  assert.match(auth, /\/auth\/v1\/token\?grant_type=refresh_token/);
  assert.match(auth, /\/api\/v1\/auth\/bootstrap/);
  assert.match(auth, /\/api\/v1\/auth\/register/);
  assert.match(auth, /\/auth\/v1\/verification/);
  assert.match(auth, /\/auth\/v1\/verification\/verify/);
  assert.match(auth, /\/auth\/v1\/signup/);
  assert.match(auth, /signUpWithPasswordFallback/);
  assert.doesNotMatch(auth, /\/rest\/v1|Supabase|supabase\.co|api\/client-config.*key/);
});

test("Native messaging and exploration calendar use authenticated CloudBase-backed app routes", async () => {
  const [messagesApi, messagesRoute, calendarRoute, repository] = await Promise.all([
    source("../native-android/app/src/main/java/com/heika/nativeapp/data/NativeMessagesApi.kt"),
    source("../app/api/v1/messages/route.ts"),
    source("../app/api/v1/exploration-calendar/route.ts"),
    source("../native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt"),
  ]);
  assert.match(messagesApi, /\/api\/v1\/messages/);
  assert.match(messagesRoute, /context\(req\)/);
  assert.match(messagesRoute, /dm_inbox_summary/);
  assert.match(calendarRoute, /context\(req\)/);
  assert.match(calendarRoute, /\.eq\("user_id", user!\.id\)/);
  assert.match(repository, /\/api\/v1\/exploration-calendar/);
  assert.doesNotMatch(repository, /dataApi\(/);
});

test("Native membership redemption uses CloudBase preview and confirmation contracts", async () => {
  const [repository, viewModel, preview, confirm] = await Promise.all([
    source("../native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt"),
    source("../native-android/app/src/main/java/com/heika/nativeapp/feature/NativeActionViewModel.kt"),
    source("../app/api/v1/membership/redeem/preview/route.ts"),
    source("../app/api/v1/membership/redeem/confirm/route.ts"),
  ]);
  assert.match(repository, /\/api\/v1\/membership\/redeem\/preview/);
  assert.match(repository, /\/api\/v1\/membership\/redeem\/confirm/);
  assert.match(repository, /previewToken/);
  assert.match(viewModel, /data\.optString\("status"\) != "valid"/);
  assert.match(viewModel, /result\.optString\("status"\) != "redeemed"/);
  assert.match(preview, /preview_membership_code/);
  assert.match(confirm, /confirm_membership_redemption/);
  assert.doesNotMatch(repository, /\/api\/v1\/membership\/redeem"/);
});

test("Native admin membership and ad image upload align with CloudBase storage APIs", async () => {
  const [repository, screen, membership, plans, batchCodes, adImage, migration] = await Promise.all([
    source("../native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt"),
    source("../native-android/app/src/main/java/com/heika/nativeapp/feature/settings/AdminCenterScreen.kt"),
    source("../app/api/v1/admin/membership/route.ts"),
    source("../app/api/v1/admin/membership/plans/[tier]/route.ts"),
    source("../app/api/v1/admin/membership/batches/[id]/codes/route.ts"),
    source("../app/api/v1/admin/exploration-ad/image/route.ts"),
    source("../cloudbase/migrations/20261115000001_exploration_ad_storage.sql"),
  ]);
  assert.match(repository, /\/api\/v1\/admin\/membership"/);
  assert.match(screen, /repository\.adminMembershipData\(\)/);
  assert.match(membership, /requireAdmin\(req\)/);
  assert.match(plans, /requireAdmin\(req\)/);
  assert.match(batchCodes, /intentionally stores only SHA-256 hashes/);
  assert.match(adImage, /requireAdmin\(req\)/);
  assert.match(adImage, /storage\.from\("exploration-ads"\)\.upload/);
  assert.match(migration, /create policy exploration_ad_images_admin_insert/);
  assert.doesNotMatch(repository, /\/batches\/\$\{encode\(batchId\)\}\/export/);
});
