import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const native = "android-native/app/src/main/java/com/heika/nativeapp";

// 合集频道的分区顺序是规格硬要求：
// 本周精选 → 近期热门 → 继续阅读 → 最近更新 → 为你推荐 → 全部合集。
// 继续阅读放在近期热门之前会打乱「先看热度、再看自己读到哪」的阅读节奏，这里锁死顺序。
test("合集频道分区顺序：继续阅读排在近期热门之后、最近更新之前", async () => {
  const web = await read("components/SeriesChannel.tsx");
  const trendingAt = web.indexOf('aria-label="近期热门"');
  // 数据不足（dense=false）时只有精选与继续阅读两块，这里要看的是 dense 分支里的那一处，
  // 所以取最后一处 ContinueReading。
  const continueAt = web.lastIndexOf("cards={data.continueReading}");
  const updatedAt = web.indexOf('aria-label="最近更新"');
  assert.ok(trendingAt > 0 && continueAt > 0 && updatedAt > 0, "分区标记缺失");
  assert.ok(trendingAt < continueAt, "继续阅读必须排在近期热门之后");
  assert.ok(continueAt < updatedAt, "继续阅读必须排在最近更新之前");

  const screen = await read(`${native}/feature/series/SeriesChannelScreen.kt`);
  const ktTrending = screen.indexOf('item(key = "trending")');
  const ktContinue = screen.indexOf('item(key = "continue")');
  const ktUpdated = screen.indexOf('item(key = "updated")');
  assert.ok(ktTrending > 0 && ktContinue > 0 && ktUpdated > 0, "原生端分区标记缺失");
  assert.ok(ktTrending < ktContinue, "原生端继续阅读必须排在近期热门之后");
  assert.ok(ktContinue < ktUpdated, "原生端继续阅读必须排在最近更新之前");
});

// 榜单是作品与合集的混合榜。搜索首页的「热门作品」「AI 资源」只能打开作品，
// 混进合集会导致 onOpenPost 拿到 series id，接口 400、点击毫无反应。
test("搜索首页热门作品与 AI 资源只取作品类型", async () => {
  const page = await read("components/SearchPage.tsx");
  assert.match(page, /filter\(\(item\) => item\.type === "post"\)/);
  assert.match(page, /setHotWorks\(posts\(/);
  assert.match(page, /setAiPicks\(posts\(/);
});

// 合集目录摘要必须走统一清洗：正文里的 ![](url) 只删符号会留下裸链接。
test("合集目录摘要使用 plainText 清洗 Markdown", async () => {
  const route = await read("app/api/v1/series/route.ts");
  assert.match(route, /import \{ plainText \} from "@\/lib\/text"/);
  assert.match(route, /excerpt: plainText\(row\.body, 90\)/);
  assert.doesNotMatch(route, /replace\(\/\[#\*`>_\[\\\]\(\)\]\/g/);
});

// 新注册用户没有 profiles 行时，收藏与阅读记录都会因外键失败。
// 迁移必须重建 auth.users 的建档触发器，接口层再对 23503 做一次补档重试。
test("账号档案缺失时收藏与阅读记录有自愈路径", async () => {
  const migration = await read("supabase/migrations/20261125121000_restore_auth_profile_trigger.sql");
  assert.match(migration, /create trigger auth_profile/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /execute function public\.create_profile\(\)/);

  const series = await read("app/api/v1/series/route.ts");
  assert.match(series, /error\?\.code === "23503"/);
  assert.match(series, /账号档案尚未就绪/);

  const events = await read("app/api/v1/events/route.ts");
  assert.match(events, /error\?\.code === "23503"/);
  assert.match(events, /readSaved: false/);
});
