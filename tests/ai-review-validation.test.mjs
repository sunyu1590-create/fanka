import test from "node:test";
import assert from "node:assert/strict";
import { validateAiReview } from "../lib/ai-review-validation.mjs";

const review = (value, body = "这是一篇普通的旅行记录。") => validateAiReview(JSON.stringify(value), body);

test("仅无风险、无风险标签和无可疑摘录的明确结果允许自动通过", () => {
  assert.equal(review({ decision: "approve", riskLevel: "clear", riskTypes: [], evidence: [], reason: "未发现审核风险。" }).decision, "approve");
  assert.equal(review({ decision: "approve", riskLevel: "low", riskTypes: [], evidence: [], reason: "看起来正常。" }).decision, "review");
  assert.equal(review({ decision: "approve", riskLevel: "clear", riskTypes: ["赌博"], evidence: [], reason: "存在风险。" }).decision, "review");
});

test("风险摘录必须是原文中的连续片段", () => {
  const exact = review({ decision: "review", riskLevel: "medium", riskTypes: ["赌博"], evidence: ["下注赢取现金"], reason: "需要人工查看相关内容。" }, "正文提到下注赢取现金，建议谨慎。 ");
  assert.equal(exact.evidenceValidated, true);
  assert.deepEqual(exact.evidence, ["下注赢取现金"]);
  const invented = review({ decision: "review", riskLevel: "high", riskTypes: ["毒品"], evidence: ["购买违禁品"], reason: "需要人工确认。" });
  assert.equal(invented.evidenceValidated, false);
  assert.deepEqual(invented.evidence, []);
  assert.equal(invented.decision, "review");
});

test("畸形 JSON 和缺少理由的输出都安全转人工", () => {
  assert.equal(validateAiReview("{bad json", "原文").decision, "review");
  assert.equal(review({ decision: "approve", riskLevel: "clear", riskTypes: [], evidence: [], reason: "" }).decision, "review");
});
