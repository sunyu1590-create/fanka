import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261119110000_unified_daily_flip_content_channels.sql", import.meta.url), "utf8");

test("daily flip quota and eligibility include community and AI posts", () => {
  assert.match(migration, /p\.channel in \('community', 'ai'\) and p\.status = 'published'/);
  assert.doesNotMatch(migration, /p\.channel\s*=\s*'community'/);
  assert.match(migration, /function private\.daily_flip_state\(p_user_id uuid\)[\s\S]*?i\.opened_at >=/);
});

test("public flip wrappers retain membership sync, experience rewards, and legacy deck state", () => {
  assert.match(migration, /public\.get_daily_flip_state\(\)[\s\S]*?membership_private\.sync_user\(uid, null\)[\s\S]*?private\.daily_flip_state\(uid\)/);
  assert.match(migration, /public\.confirm_daily_flip\([\s\S]*?membership_private\.sync_user\(uid, null\)[\s\S]*?private\.confirm_daily_flip\(p_post_id, p_idempotency_key\)/);
  assert.match(migration, /public\.record_experience_event\('flip', p_post_id\)/);
  assert.match(migration, /update public\.daily_cards[\s\S]*?c\.post_id = p_post_id/);
});
