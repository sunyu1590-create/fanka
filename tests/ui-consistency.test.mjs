import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cachedPostNeedsRefresh, normalizeCachedPost, stableCardMediaUrl } from "../lib/card-media.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const native = "android-native/app/src/main/java/com/heika/nativeapp";

test("卡片图片缓存只接受稳定地址：临时地址丢弃，签名地址改走站内媒体路由", () => {
  assert.equal(stableCardMediaUrl("blob:https://moonclean.shop/2f1c"), undefined);
  assert.equal(stableCardMediaUrl("file:///data/user/0/tmp.jpg"), undefined);
  assert.equal(stableCardMediaUrl(""), undefined);

  const signed = stableCardMediaUrl(
    "https://dnotobyltytpgplfimzo.supabase.co/storage/v1/object/sign/post-covers/u1/card-1.jpg?token=abc.def",
  );
  assert.ok(signed, "签名地址必须能还原成稳定地址");
  assert.ok(signed.startsWith("/api/v1/media?path="), signed);
  assert.match(signed, /redirect=1/);
  assert.match(signed, /variant=card/);
  assert.doesNotMatch(signed, /token=/);

  // 站内路由同样补齐参数，避免同一张图出现多种地址
  assert.match(
    stableCardMediaUrl("/api/v1/media?path=post-covers%2Fu1%2Fcard-1.jpg"),
    /redirect=1&variant=card$/,
  );
  // 外链保持原样
  assert.equal(stableCardMediaUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
});

test("媒体路由接受卡片原图变体，feed 缩略图保持原样", async () => {
  const route = await read("app/api/v1/media/route.ts");
  assert.match(route, /variant !== "feed" && variant !== "card"/);
  const feed = stableCardMediaUrl("/api/v1/media?path=post-covers%2Fu1%2Fa.jpg&variant=feed");
  assert.match(feed, /variant=feed/);
  assert.match(feed, /redirect=1/);
  assert.doesNotMatch(feed, /variant=card/);
});

test("历史缓存快照会把签名地址换成稳定地址，并用 images 回填 image", () => {
  const legacy = {
    id: 7,
    title: "旧缓存",
    body: "正文",
    image: "",
    images: ["https://dnotobyltytpgplfimzo.supabase.co/storage/v1/object/sign/post-covers/u1/a.jpg?token=t"],
  };
  assert.equal(cachedPostNeedsRefresh(legacy), false, "已经是可修复地址时不强制刷新");
  const fixed = normalizeCachedPost(legacy);
  assert.ok(fixed.image?.startsWith("/api/v1/media?path="), fixed.image);
  assert.ok(fixed.images?.every((source) => source.startsWith("/api/v1/media?path=")));

  assert.equal(cachedPostNeedsRefresh({ ...legacy, images: ["blob:https://moonclean.shop/x"] }), true);
  assert.equal(normalizeCachedPost({ ...legacy, images: ["blob:https://moonclean.shop/x"] }).image, undefined);
});

test("封面双保险：云端版本字段、IndexedDB 缓存与 blob 不入库", async () => {
  const migration = await read("supabase/migrations/20261122180000_profile_cover_version.sql");
  assert.match(migration, /cover_version integer not null default 0/);
  assert.match(migration, /cover_updated_at timestamptz/);

  const coverRoute = await read("app/api/v1/me/cover/route.ts");
  assert.match(coverRoute, /export async function GET/);
  assert.match(coverRoute, /cover_version/);
  // 上传与删除都要推进版本，删除后才能压过本地旧图
  const bumpCount = coverRoute.match(/cover_version[\s\S]{0,40}\+\s*1|update\(\{[^}]*cover_version/g) ?? [];
  assert.ok(bumpCount.length >= 2, "PUT 与 DELETE 都必须推进 cover_version");

  const libraryState = await read("app/api/v1/library-state/route.ts");
  assert.match(libraryState, /cover_url/);
  assert.match(libraryState, /cover_version/);
  assert.match(libraryState, /cover_updated_at/);

  const cache = await read("lib/cover-cache.ts");
  assert.match(cache, /indexedDB/);
  assert.match(cache, /heika-profile-cover-v1/);

  const community = await read("components/Community.tsx");
  // blob 地址只能活在内存里，写本地存储前必须换成云端地址
  assert.match(community, /startsWith\("blob:"\)/);
  assert.match(community, /coverRemoteRef\.current/);
  assert.doesNotMatch(community, /localStorage\.setItem\([^)]*createObjectURL/);
});

test("探索中心三指标、28 天热力图与历史分页双端一致", async () => {
  const community = await read("components/Community.tsx");
  assert.match(community, /explore-metrics/);
  assert.match(community, /explore-heatmap/);
  assert.match(community, /explorationHistoryLimit/);
  assert.match(community, /累计翻卡/);

  const screens = await read(`${native}/feature/exploration/ExplorationScreens.kt`);
  assert.match(screens, /累计翻卡/);
  assert.match(screens, /28 天探索轨迹/);
  assert.match(screens, /探索月报/);
  assert.match(screens, /加载更多/);
  // 月报入口要有真实页面，不能只是按钮
  assert.match(screens, /fun ExplorationRecapScreen/);

  const api = await read("app/api/v1/exploration-calendar/route.ts");
  assert.match(api, /lifetimeTotal/);
  assert.match(api, /windowDays/);
  assert.match(api, /recentRecords/);
});

test("发布分类只在提交时触发，服务端用 routeConfirmed 去重", async () => {
  for (const path of ["app/api/v1/library-state/route.ts", "app/api/v1/ai-space/route.ts"]) {
    const route = await read(path);
    assert.match(route, /routeConfirmed !== true/, `${path} 必须跳过重复分类`);
    assert.match(route, /enqueuePostReview/, `${path} 不能跳过人工复审`);
  }
  const vm = await read(`${native}/feature/publish/PublishViewModel.kt`);
  assert.match(vm, /resolveRoute/);
  assert.match(vm, /routeConfirmed = current\.routeSource == "ai"/);
});

test("APP 个人中心按网页版式：通栏封面、跨封面头像与下划线标签", async () => {
  const profile = await read(`${native}/feature/profile/ProfileScreen.kt`);
  // 方案 A：封面 260–320dp 区间（网页端移动视口同区间），零圆角、横向铺满。
  const cover = profile.match(/height\((\d+)\.dp\)\.background\(MaterialTheme\.colorScheme\.surfaceVariant\)/);
  assert.ok(cover, "封面高度需直接写在通栏 Box 上");
  const coverHeight = Number(cover[1]);
  assert.ok(coverHeight >= 260 && coverHeight <= 320, `封面高度 ${coverHeight}dp 超出 260–320dp 区间`);
  assert.doesNotMatch(profile, /RoundedCornerShape[^\n]*cover/i, "封面不允许圆角");
  // 顶栏实心占位：品牌栏抬高层级并用主题背景，列表正常落到屏幕底边（不再 offset 挖坑）
  assert.match(profile, /zIndex\(2f\)/);
  assert.doesNotMatch(profile, /hazeEffect\(/);
  assert.match(profile, /padding\(top = HeikaSpacing\.headerHeight\)/);
  // 封面通栏不能再靠 requiredWidth + offset（会把整块内容左移 18dp、右边少一条）
  assert.match(profile, /bleedHorizontal\(pageGutter\)/);
  assert.doesNotMatch(profile, /requiredWidth\(viewportWidth\)/);
  assert.match(profile, /Brush\.verticalGradient/);
  assert.match(profile, /fun ProfileStat/);
  assert.match(profile, /fun ProfileTabBar/);
  assert.match(profile, /82\.dp/);
});

test("卡片文字只按整行截断：标题不收缩，摘要行数按卡面高度取整", async () => {
  const css = await read("app/design-system.css");
  // 标题/元信息/底部不参与 flex 压缩，否则会被压成半行
  assert.match(css, /\.card-back-meta, \.card-back-title, \.card-back-foot \{ flex: none; \}/);
  assert.match(css, /max-height: calc\(1\.34em \* 3\)/);
  // 摘要行数由组件算出并写进 CSS 变量，末行不会只露半个字
  assert.match(css, /-webkit-line-clamp: var\(--card-excerpt-lines, 4\)/);
  assert.match(css, /\.card-back-excerpt[^}]*flex: 0 0 auto/);

  const face = await read("components/CardFace.tsx");
  assert.match(face, /ResizeObserver/);
  assert.match(face, /--card-excerpt-lines/);
  assert.match(face, /Math\.floor\(available \/ lineHeight\)/);

  // 原生端：文字区自适应，图片吃剩余空间
  const home = await read(`${native}/feature/home/HomeScreen.kt`);
  assert.match(home, /wrapContentHeight\(\)\.padding\(horizontal = 17\.dp/);
  assert.doesNotMatch(home, /weight\(0\.40f\)/);
});

test("探索中心长标题不再撑破页面：网格列宽锁定 1fr", async () => {
  const css = await read("app/design-system.css");
  assert.match(css, /\.explore-day-posts \{ display: grid; grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.explore-history-day \{ display: grid; grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.explore-day-posts button \{\n  min-width: 0;/);
});

test("个人中心头像与昵称同一条水平线：两列网格，不再整块换行", async () => {
  const css = await read("app/profile.css");
  assert.match(css, /\.profile-hero-identity \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: var\(--profile-avatar-size\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.profile-hero-identity \{ flex-wrap: wrap/);
  // 小屏变量必须在 .profile-hero 上，头像自身声明无法影响身份区的负边距
  assert.match(css, /\.profile-hero \{\n  --profile-avatar-size: 88px;/);
  assert.match(css, /@media \(max-width: 430px\) \{[\s\S]*?--profile-avatar-size: 78px/);
});

test("底栏自定义图标加载失败会回退，不会点击后消失", async () => {
  const community = await read("components/Community.tsx");
  assert.match(community, /function BottomNavDecorIcon/);
  assert.match(community, /probe\.onerror/);
  assert.match(community, /onError=\{\(\) => setFailed/);
  assert.match(community, /if \(!src\) return <Fallback size=\{21\}/);
});
