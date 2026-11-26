/**
 * 版本更新审核判定（AI 自动审核，无人工环节）。
 *
 * 复用 3.0 审核校验器（validateAiReview）的硬性约束：
 *   - 只有「强制拦截类别 + high + 原文可逐字定位的证据」才是 REJECT；
 *   - 解析失败、模型犹豫、证据不成立，一律按正常内容放行（degraded 记录）；
 *   - 因此格式异常不会误伤作品，也不会误判违规。
 *
 * 在此之上追加两条版本审核专属规则：
 *   1. REVIEW（边界内容）在无人值守链路里等同于通过，只留档不拦截；
 *   2. 仅凭链接/附件推测的风险不足以驳回——除非确定性扫描真的命中了不安全链接。
 */

import { validateAiReview } from "./ai-review-validation.mjs";

const URL_LIKE = /^(?:https?:\/\/|www\.)/i;

function safeList(value, max, limit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    if (text) seen.add(text);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/** 从模型输出中提取可执行的修改建议；只保留短句，避免把整段解释塞给用户。 */
export function parseRevisionSuggestions(output) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(output ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  return safeList(parsed.suggestions, 200, 3);
}

/**
 * @param {string} output 模型原始输出
 * @param {string} nextText 新版本中可被引用的正文（标题 + 正文 + 资源字段）
 * @param {{ policyVersion?: string; hardBlock?: boolean }} [options]
 */
export function decideRevisionReview(output, nextText, options = {}) {
  const result = validateAiReview(output, nextText, { policyVersion: options.policyVersion || "revision-1.0" });
  let decision = result.decision === "REJECT" ? "reject" : "approve";
  let reasonCode = result.reasonCode;
  let reason = result.reason;

  // 只有 URL 证据、且确定性扫描没有命中时，说明是模型对链接的猜测，不能据此驳回。
  if (decision === "reject" && options.hardBlock !== true) {
    const evidence = result.evidence || [];
    const onlyLinks = evidence.length > 0 && evidence.every((item) => URL_LIKE.test(String(item).trim()));
    if (onlyLinks) {
      decision = "approve";
      reasonCode = "link_speculation_pass";
      reason = "正常内容默认通过；链接未通过确定性安全检测发现风险。";
    }
  }

  const suggestions = decision === "reject" ? parseRevisionSuggestions(output) : [];
  if (decision === "reject" && !suggestions.length) {
    suggestions.push("请删除或修改被指出的内容后重新提交。");
  }

  return {
    decision,
    riskLevel: result.riskLevel,
    riskTypes: result.riskTypes,
    evidence: result.evidence,
    reason,
    reasonCode,
    suggestions,
    degraded: result.degraded,
    policyVersion: result.policyVersion,
  };
}
