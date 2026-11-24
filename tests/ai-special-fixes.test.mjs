import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const native = "android-native/app/src/main/java/com/heika/nativeapp";

test("发布资源信息已全平台取消，旧必填校验不再阻塞提交", async () => {
  const webRules = await read("lib/ai-resources.ts");
  const webComposer = await read("components/Community.tsx");
  const publishVm = await read(`${native}/feature/publish/PublishViewModel.kt`);
  const publishScreen = await read(`${native}/feature/publish/PublishScreen.kt`);
  const rules = await read(`${native}/feature/publish/AiResourceRules.kt`);

  assert.doesNotMatch(webRules, /resourceRequirements|required fields|请补全此类资源/);
  assert.match(webRules, /发布时不再要求填写任何「资源信息」字段/);
  assert.doesNotMatch(webComposer, /AI_EDITOR_FIELDS|composer-ai-resource-fields/);
  assert.doesNotMatch(publishVm, /missingRequiredFields|validateAiResource\(/);
  assert.doesNotMatch(publishScreen, /aiResourceFields\(|使用场景/);
  assert.doesNotMatch(rules, /requiredFields|missingRequiredFields|isSafeSourceUrl/);
  assert.match(publishVm, /标题不能为空/);
  assert.match(publishVm, /正文内容不能为空/);
});

test("AI 发布检测只在点击发布后触发，并推荐已有话题", async () => {
  const community = await read("components/Community.tsx");
  const api = await read("app/api/v1/composer/route.ts");
  const routing = await read("lib/composer-routing.ts");

  // 不再有输入防抖自动检测
  assert.doesNotMatch(community, /setTimeout\(\(\) => \{ void detectComposerRouteRef\.current\(\); \}, 1100\)/);
  assert.match(community, /runComposerSuggest/);
  // 发布面板改为五态状态提示：常驻的 AI 建议块与二次确认已移除
  assert.doesNotMatch(community, /composer-suggest/);
  assert.doesNotMatch(community, /确认发布<\/button>/);
  assert.doesNotMatch(community, /重新检测/);
  assert.match(community, /composerCheckPhase/);
  // 分类结果在同一次点击内用掉，并随提交体回传，服务端不再重复入队
  assert.match(community, /routeClassifiedByAi/);
  assert.match(community, /routeConfirmed: routeClassifiedByAi/);
  assert.match(community, /正在检查内容/);
  assert.match(community, /内容检查暂时失败/);
  // 原生端同样只在点击发布后判断分类
  const publishScreen = await read(`${native}/feature/publish/PublishScreen.kt`);
  assert.doesNotMatch(publishScreen, /delay\(1200\)/);
  assert.match(publishScreen, /发布状态/);
  // 话题优先复用 Supabase 已有话题，且不硬凑
  assert.match(api, /pickTopicsByRules/);
  assert.match(api, /normalizeTopicSuggestions/);
  assert.match(api, /interest_tags/);
  assert.match(routing, /normalizeTopicSuggestions/);
});

test("网页 AI 卡片无图不占位，图片失败可重试", async () => {
  const space = await read("components/AISpace.tsx");
  const css = await read("app/design-system.css");

  assert.match(space, /is-text-only/);
  assert.match(space, /ai-resource-cover-failed/);
  assert.match(space, /封面加载失败/);
  assert.doesNotMatch(space, /min-height:168px/);
  assert.match(css, /\.ai-resource-grid \{ align-items: start; \}/);
  assert.doesNotMatch(css, /\.ai-resource-card\.is-text-only \.ai-resource-open \{[^}]*min-height:168px/);
  // 无图时不渲染图片区容器
  assert.match(space, /textOnly = !rawCover/);
});

test("网页 AI 分类中心与 APP 端同名同图标，并接入浏览器历史", async () => {
  const space = await read("components/AISpace.tsx");

  assert.match(space, /RESOURCE_TYPE_PRESENTATION/);
  assert.match(space, /resource_type/);
  assert.match(space, /pushState/);
  assert.match(space, /popstate/);
  for (const label of ["Agent", "Skills", "Prompt", "AI 工具", "AI 知识", "案例实践"]) {
    assert.ok(space.includes(label), `分类中心应包含「${label}」`);
  }
});

test("安卓 AI 入口随内容滚动，详情页顶栏纯黑且无图不占位", async () => {
  const discovery = await read(`${native}/feature/discovery/DiscoveryScreen.kt`);
  const detail = await read(`${native}/feature/detail/PostDetailScreen.kt`);

  // 探索 AI 资源是内容流首项，不再塞在折叠头部
  assert.match(discovery, /ai-resource-entry/);
  assert.match(discovery, /aiEntry = if \(filter\.channel == "ai"\)/);
  // 顶部紧凑双行：分类行 + 固定搜索/筛选按钮
  assert.match(discovery, /contentDescription = "搜索"/);
  assert.match(discovery, /HeikaIcons\.Sparkles/);
  // 详情顶栏主题自适应：渐变随深浅色走，浅色模式不再是纯黑条
  assert.match(detail, /Brush\.verticalGradient/);
  assert.match(detail, /headerFade/);
  assert.doesNotMatch(detail, /HeikaGlassTopBar/);
  // 无图不生成虚假封面
  assert.doesNotMatch(detail, /暂无图片/);
  // 双悬浮栏统一 54dp 胶囊
  assert.match(detail, /heightIn\(min = 54\.dp\)/);
});

test("AI 空间卡片首开详情不再被存在性守卫拦截", async () => {
  const community = await read("components/Community.tsx");
  // openAiPost 必须把条目作为 resolvedPost 传给 openPost：
  // rAF 闭包里的 all 可能尚未包含该条，不带 resolvedPost 会被直接 return。
  assert.match(community, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => openPost\(item\.id, "discover", source, item\)\)\)/);
  // 签名新增了 options（直达链接的 instant / fromRoute），resolvedPost 仍是绕过守卫的关键参数。
  assert.match(community, /resolvedPost\?: Post,\s*\n\s*options\?: \{ instant\?: boolean; fromRoute\?: boolean \}/);
  assert.match(community, /\(!resolvedPost && !all\.some/);
});
