import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedbackInput } from "../lib/feedback-validation.ts";

test("反馈分类限定为设置中心提供的选项", () => {
  assert.equal(validateFeedbackInput("suggestion", "这是一个非常有效的建议").error, undefined);
  assert.equal(validateFeedbackInput("unexpected", "这是一个非常有效的建议").error, "请选择反馈分类");
});

test("反馈内容去除首尾空白并限制长度", () => {
  assert.deepEqual(validateFeedbackInput("problem", "  页面加载时遇到问题，请帮助检查。  "), {
    value: { category: "problem", message: "页面加载时遇到问题，请帮助检查。" },
  });
  assert.equal(validateFeedbackInput("other", "太短").error, "反馈内容须为 10–3000 个字符");
  assert.equal(validateFeedbackInput("other", "a".repeat(3001)).error, "反馈内容须为 10–3000 个字符");
});
