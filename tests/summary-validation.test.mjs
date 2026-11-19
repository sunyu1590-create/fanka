import test from "node:test";
import assert from "node:assert/strict";
import { summaryWordCount, validateSummary } from "../lib/summary-validation.mjs";

test("AI summaries enforce the requested 50 word and character limits", () => {
  assert.equal(validateSummary("黑卡提供精选内容与 AI 创作工具。"), true);
  const fiftyOneWords = Array.from({ length: 51 }, () => "摘要").join(" ");
  assert.equal(summaryWordCount(fiftyOneWords), 51);
  assert.equal(validateSummary(fiftyOneWords), false);
  assert.equal(validateSummary("x".repeat(601)), false);
  assert.equal(validateSummary("   "), false);
});
