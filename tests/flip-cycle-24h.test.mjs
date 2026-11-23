import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261123190000_flip_cycle_24h.sql", import.meta.url), "utf8");
const community = await readFile(new URL("../components/Community.tsx", import.meta.url), "utf8");

test("翻卡周期为 24 小时滚动窗口，而不是自然日 0 点重置", () => {
  assert.match(migration, /create table if not exists private\.flip_cycles/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /v_now \+ interval '24 hours'/);
  // 周期切换发生在服务端事务内，客户端无法改写到期时间
  assert.match(migration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(p_user_id::text \|\| ':flip_cycle', 0\)\)/);
  assert.match(migration, /v_cycle\.closed_at is not null or v_cycle\.expires_at <= v_now/);
});

test("周期状态返回到期时间与剩余秒数，额度按周期区间统计", () => {
  assert.match(migration, /'cycleId', v_cycle\.cycle_id/);
  assert.match(migration, /'cycleExpiresAt', v_cycle\.expires_at/);
  assert.match(migration, /'cycleSecondsRemaining'/);
  assert.match(migration, /i\.opened_at >= v_cycle\.started_at\s*and i\.opened_at < v_cycle\.expires_at/);
});

test("切换周期只重置额度，不清空累计统计、收藏、作品与历史记录", () => {
  assert.doesNotMatch(migration, /delete\s+from\s+public\.user_interactions/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.decor_favorites/i);
  assert.doesNotMatch(migration, /delete\s+from\s+private\.daily_flip_days/i);
  assert.doesNotMatch(migration, /delete\s+from\s+private\.daily_flip_attempts/i);
  // 旧表保留只读，历史数据可回溯
  assert.match(migration, /from private\.daily_flip_days d/);
});

test("同一周期内重复确认保持幂等，不重复消耗次数", () => {
  assert.match(migration, /from private\.flip_cycle_attempts a\s*where a\.user_id = v_user and a\.cycle_id = v_cycle\.cycle_id and a\.idempotency_key = p_idempotency_key/);
  assert.match(migration, /'idempotent', true/);
});

test("前端按周期而非自然日缓存卡池，并展示到期倒计时", () => {
  assert.match(community, /cycleExpiresAt/);
  assert.match(community, /cycleSecondsRemaining|cycleStartedAt/);
  assert.match(community, /const deckDay = cycleStart \? dayKey\(new Date\(cycleStart\), zone\) : today;/);
  assert.match(community, /本周期已翻开/);
});
