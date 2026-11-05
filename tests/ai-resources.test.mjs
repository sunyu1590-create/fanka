import test from "node:test";
import assert from "node:assert/strict";
import { safeResourceLink, validateAiResourceData } from "../lib/ai-resources.ts";

test("AI structured resource types enforce their required fields", () => {
  assert.match(validateAiResourceData("agent", {}).error, /必填/);
  assert.deepEqual(validateAiResourceData("knowledge_article", { ignored: "value" }), {});
  const prompt = validateAiResourceData("prompt", { model: "GPT", scenario: "写作", prompt: "生成提纲" });
  assert.equal(prompt.prompt, "生成提纲");
});

test("AI resource links accept public HTTPS URLs and reject unsafe destinations", () => {
  assert.equal(safeResourceLink("https://example.com/guide"), "https://example.com/guide");
  assert.equal(safeResourceLink("http://example.com/guide"), "");
  assert.equal(safeResourceLink("https://127.0.0.1/secret"), "");
  assert.equal(safeResourceLink("https://user:pass@example.com/"), "");
});

test("resource submission rejects private URLs and oversized fields", () => {
  const base = { functionality: "自动执行工作流", platforms: "Web", run_mode: "云端", version: "1.0", source_url: "https://example.com" };
  assert.match(validateAiResourceData("agent", { ...base, source_url: "https://localhost/setup" }).error, /内网地址/);
  assert.match(validateAiResourceData("agent", { ...base, tutorial: "x".repeat(12001) }).error, /12000/);
});
