import test from "node:test";
import assert from "node:assert/strict";
import { validateAiClassification } from "../lib/ai-classification-validation.mjs";

test("only approved category and tag IDs can be applied", () => {
  assert.deepEqual(validateAiClassification(
    JSON.stringify({ confidence: "high", categoryId: 12, tagIds: [31, 32], reason: "内容主题明确" }),
    [12, 13], [31, 32, 33],
  ), { applicable: true, reason: "内容主题明确", categoryId: "12", tagIds: ["31", "32"] });
});

test("uncertain, unknown, duplicated, and oversized results safely preserve current taxonomy", () => {
  const allowedCategories = [12];
  const allowedTags = [31, 32, 33, 34, 35, 36];
  for (const output of [
    JSON.stringify({ confidence: "low", categoryId: 12, tagIds: [] }),
    JSON.stringify({ confidence: "high", categoryId: 999, tagIds: [] }),
    JSON.stringify({ confidence: "high", categoryId: 12, tagIds: [31, 31] }),
    JSON.stringify({ confidence: "high", categoryId: 12, tagIds: [31, 32, 33, 34, 35, 36] }),
    "not-json",
  ]) assert.equal(validateAiClassification(output, allowedCategories, allowedTags).applicable, false);
});
