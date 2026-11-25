import test from "node:test";
import assert from "node:assert/strict";
import { validateAiReview } from "../lib/ai-review-validation.mjs";

const review = (value, body = "这是一篇普通的旅行记录，记录了路线、花费和住宿。") => validateAiReview(JSON.stringify(value), body);

test("正常内容默认通过，不再因为「不确定」转人工", () => {
  // 明确无风险、模型给出 approve/pass，直接放行
  const clear = review({ decision: "approve", riskLevel: "clear", riskTypes: [], evidence: [], reason: "未发现审核风险。" });
  assert.equal(clear.decision, "PASS");
  assert.equal(clear.legacyDecision, "approve");

  // 模型说 low（轻微）也不进人工：只有明确违规才介入
  const low = review({ decision: "approve", riskLevel: "low", riskTypes: [], evidence: [], reason: "文风随口，但属于正常表达。" });
  assert.equal(low.decision, "PASS");

  // uncertain 是降级信号，同样默认通过，并在 reasonCode 里留痕
  const uncertain = review({ decision: "review", riskLevel: "uncertain", riskTypes: [], evidence: [], reason: "无法判断。" });
  assert.equal(uncertain.decision, "PASS");
  assert.equal(uncertain.reasonCode, "review_without_evidence_pass");
});

test("技术教程与开源介绍不会仅因关键词被拦截", () => {
  const body = "本文介绍如何用 Python 调用代理池、绕过反爬限制，代码来自开源仓库 example/proxy-pool。";
  const result = review({ decision: "approve", riskLevel: "clear", riskTypes: ["malware"], evidence: [], reason: "提到爬虫代理。" }, body);
  assert.equal(result.decision, "PASS");
});

test("明确违规必须给出高风险等级与原文可定位证据才驳回", () => {
  const body = "加微信 xxx 领取内部渠道，先交保证金再返现，稳赚不赔。";
  const withEvidence = review({ decision: "reject", riskLevel: "high", riskTypes: ["fraud"], evidence: ["先交保证金再返现"], reason: "诱导转账，属于诈骗话术。" }, body);
  assert.equal(withEvidence.decision, "REJECT");
  assert.equal(withEvidence.evidenceValidated, true);
  assert.deepEqual(withEvidence.evidence, ["先交保证金再返现"]);

  // 证据不是原文片段 → 驳回不成立，降级为通过（而不是定罪）
  const invented = review({ decision: "reject", riskLevel: "high", riskTypes: ["fraud"], evidence: ["转账到指定账户"], reason: "疑似诈骗。" }, body);
  assert.equal(invented.decision, "PASS");
  assert.equal(invented.reasonCode, "reject_without_evidence_pass");

  // 类别对、证据在，但风险只到中等 → 交人工，不直接驳回
  const medium = review({ decision: "reject", riskLevel: "medium", riskTypes: ["commercial_spam"], evidence: ["加微信 xxx"], reason: "广告。" }, body);
  assert.equal(medium.decision, "REVIEW");
});

test("模型调用失败或解析异常独立处理，不判定为违规", () => {
  const broken = validateAiReview("{bad json", "原文");
  assert.equal(broken.decision, "PASS");
  assert.equal(broken.degraded, true);
  assert.equal(broken.reasonCode, "parse_error_pass");

  const empty = review({ decision: "approve", riskLevel: "clear", riskTypes: [], evidence: [], reason: "" });
  assert.equal(empty.decision, "PASS");
});

test("非强制类别即使高风险也不直接驳回", () => {
  const body = "这段话在讨论历史事件中的政治争议，引用了公开出版物。";
  const result = review({ decision: "reject", riskLevel: "high", riskTypes: ["political_debate"], evidence: ["政治争议"], reason: "涉及争议话题。" }, body);
  assert.equal(result.decision, "PASS");
  // 未知/非强制类别会被归一化丢弃，驳回不成立，按正常内容放行
  assert.equal(result.reasonCode, "reject_without_evidence_pass");
});
