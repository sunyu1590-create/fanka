import test from "node:test";
import assert from "node:assert/strict";
import { safeResourceLink, validateAiResourceData } from "../lib/ai-resources.ts";

test("取消资源信息后任何内容类型都能只发标题与正文", () => {
  // 以前 agent/prompt 等类型会因缺少功能说明、资源链接等字段被拦下，
  // 现在空的资源信息一律放行，返回空对象而不是 error。
  for (const type of ["agent", "skill", "prompt", "ai_tool", "tutorial", "knowledge_article"]) {
    const result = validateAiResourceData(type, {});
    assert.ok(!("error" in result), `${type} 不应再要求资源信息`);
    assert.deepEqual(result, {});
    assert.deepEqual(validateAiResourceData(type, null), {});
    assert.deepEqual(validateAiResourceData(type, undefined), {});
    assert.deepEqual(validateAiResourceData(type, "not-an-object"), {});
  }
});

test("编辑历史作品时保留的旧字段仍做格式与链接安全校验", () => {
  const prompt = validateAiResourceData("prompt", { model: "GPT", scenario: "写作", prompt: "生成提纲" });
  assert.equal(prompt.prompt, "生成提纲");
  const base = { functionality: "自动执行工作流", platforms: "Web", run_mode: "云端", version: "1.0", source_url: "https://example.com" };
  assert.match(validateAiResourceData("agent", { ...base, source_url: "https://localhost/setup" }).error, /内网地址/);
  assert.match(validateAiResourceData("agent", { ...base, note: "x".repeat(12001) }).error, /12000/);
});

test("AI resource links accept public HTTPS URLs and reject unsafe destinations", () => {
  assert.equal(safeResourceLink("https://example.com/guide"), "https://example.com/guide");
  assert.equal(safeResourceLink("http://example.com/guide"), "");
  assert.equal(safeResourceLink("https://127.0.0.1/secret"), "");
  assert.equal(safeResourceLink("https://user:pass@example.com/"), "");
});
