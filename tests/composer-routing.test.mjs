import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAiRoute, routeByRules, describeRoute } from "../lib/composer-routing.ts";

const community = ["生活", "摄影", "设计", "科技"];
const ai = ["AI 知识", "AI 工具", "开发"];

test("生活记录投到社区精选", () => {
  const route = routeByRules({
    title: "周末去了海边",
    body: "风很大，海水是灰蓝色的。坐在礁石上发了很久的呆，回来路上买了一杯热咖啡。",
    communityCategories: community,
    aiCategories: ai,
  });
  assert.equal(route.channel, "community");
  assert.equal(route.contentType, "knowledge_article");
  assert.equal(route.category, "生活");
  assert.match(route.reason, /社区|生活/);
});

test("代码与部署命令投到 AI 空间，并识别为教程", () => {
  const route = routeByRules({
    title: "在服务器上部署本地大模型",
    body: "先安装依赖：\n```bash\npip install vllm\ndocker run --gpus all vllm/vllm-openai\n```\n然后配置 API Key，就能用 OpenAI 兼容接口调用模型。",
    communityCategories: community,
    aiCategories: ai,
  });
  assert.equal(route.channel, "ai");
  assert.equal(route.contentType, "tutorial");
  assert.ok(route.confidence > 0.5);
  assert.match(describeRoute(route), /^AI 空间/);
});

test("提示词模板识别为 prompt", () => {
  const route = routeByRules({
    title: "一套好用的写作提示词",
    body: "这是我常用的系统指令：你是一位中文编辑，请保留原意，只优化结构。直接复制到对话框即可。",
    communityCategories: community,
    aiCategories: ai,
  });
  assert.equal(route.channel, "ai");
  assert.equal(route.contentType, "prompt");
});

test("空内容不会被误投进 AI 专区", () => {
  const route = routeByRules({ title: "", body: "", communityCategories: community, aiCategories: ai });
  assert.equal(route.channel, "community");
  assert.equal(route.category, "生活");
});

test("模型返回的分类不在候选里时回退到规则结果", () => {
  const input = { title: "随手拍", body: "今天的天空很好看，拍了几张照片。", communityCategories: community, aiCategories: ai };
  const fallback = routeByRules(input);
  const route = normalizeAiRoute({ channel: "community", contentType: "tutorial", category: "不存在的分类", confidence: 0.9, reason: "测试" }, fallback, input);
  assert.equal(route.channel, "community");
  assert.equal(route.contentType, "knowledge_article", "社区内容不允许带 AI 类型");
  assert.equal(route.category, fallback.category);
  assert.equal(route.source, "ai");
});

test("模型返回结构不可信时整体回退", () => {
  const input = { title: "标题", body: "正文内容足够长，用于判断。", communityCategories: community, aiCategories: ai };
  const fallback = routeByRules(input);
  for (const value of [null, "ai", { channel: "unknown" }, { channel: 1 }]) {
    assert.equal(normalizeAiRoute(value, fallback, input).source, fallback.source);
  }
});
