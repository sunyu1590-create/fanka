import test from "node:test";
import assert from "node:assert/strict";
import { summaryWordCount, validateSummary } from "../lib/summary-validation.mjs";

test("AI summaries use a CJK character budget and a word budget for Latin text", () => {
  assert.equal(validateSummary("黑卡提供精选内容与 AI 创作工具。"), true);
  assert.equal(validateSummary("黑".repeat(140)), true);
  assert.equal(validateSummary("黑".repeat(170)), false);
  assert.equal(validateSummary("x".repeat(601)), false);
  assert.equal(validateSummary("   "), false);
});

test("Long English summaries still respect the 50 word limit", () => {
  const fiftyOneWords = Array.from({ length: 51 }, () => "summary").join(" ");
  assert.equal(summaryWordCount(fiftyOneWords), 51);
  assert.equal(validateSummary(fiftyOneWords), false);
  assert.equal(validateSummary(Array.from({ length: 40 }, () => "summary").join(" ")), true);
});
