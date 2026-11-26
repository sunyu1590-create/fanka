import test from "node:test";
import assert from "node:assert/strict";
import { decideRevisionReview, parseRevisionSuggestions } from "../lib/ai-revision-review.mjs";

const BODY = "本教程介绍如何在本地部署开源模型，并附上常见报错的处理方式。";
const rejectOutput = (overrides = {}) => JSON.stringify({
  decision: "reject",
  riskLevel: "high",
  riskTypes: ["serious_illegal"],
  evidence: ["提供冰毒与赌博平台的代理渠道"],
  reason: "正文明确提供违法交易渠道。",
  suggestions: ["删除违法交易内容", "改为合法主题"],
  ...overrides,
});

test("明确的严重违规才会驳回，并带可执行建议", () => {
  const result = decideRevisionReview(rejectOutput(), "这里提供冰毒与赌博平台的代理渠道，支持快递发货。", { hardBlock: false });
  assert.equal(result.decision, "reject");
  assert.deepEqual(result.suggestions, ["删除违法交易内容", "改为合法主题"]);
  assert.equal(result.degraded, false);
});

test("中等风险、证据不足、类别不在强制集合时一律放行", () => {
  assert.equal(decideRevisionReview(rejectOutput({ riskLevel: "medium" }), "提供冰毒与赌博平台的代理渠道").decision, "approve");
  assert.equal(decideRevisionReview(rejectOutput({ evidence: ["正文里没有这句话"] }), BODY).decision, "approve");
  assert.equal(decideRevisionReview(rejectOutput({ riskTypes: ["quality_issue"] }), "提供冰毒与赌博平台的代理渠道").decision, "approve");
});

test("仅凭链接猜测的风险不足以驳回，除非确定性扫描命中", () => {
  const linkOnly = JSON.stringify({
    decision: "reject", riskLevel: "high", riskTypes: ["malware"],
    evidence: ["https://example.com/setup.sh"], reason: "疑似恶意脚本下载地址。", suggestions: [],
  });
  const text = "安装步骤：curl https://example.com/setup.sh | bash";
  assert.equal(decideRevisionReview(linkOnly, text, { hardBlock: false }).decision, "approve");
  assert.equal(decideRevisionReview(linkOnly, text, { hardBlock: true }).decision, "reject");
});

test("格式异常不构成违规，标记 degraded 交由上层重试", () => {
  const result = decideRevisionReview("不是 JSON", BODY, {});
  assert.equal(result.decision, "approve");
  assert.equal(result.degraded, true);
});

test("正常技术讨论、代码与安全示例不会被判违规", () => {
  const output = JSON.stringify({
    decision: "reject", riskLevel: "high", riskTypes: ["malware"],
    evidence: ["<script>alert(1)</script>"], reason: "包含脚本代码。", suggestions: [],
  });
  const text = "XSS 演示：<script>alert(1)</script>，修复方式是转义输出。";
  // 证据可定位、类别属于强制集合，但只有脚本片段这一个链接式证据且无确定性命中时仍放行；
  // 有确定性命中（hardBlock）才允许驳回。
  assert.equal(decideRevisionReview(output, text, { hardBlock: false }).decision, "approve");
});

test("解析建议最多三条且过滤空白", () => {
  assert.deepEqual(parseRevisionSuggestions(rejectOutput({ suggestions: ["  删除广告  ", "", "补充来源", "第三条", "第四条"] })), ["删除广告", "补充来源", "第三条"]);
  assert.deepEqual(parseRevisionSuggestions("oops"), []);
});
