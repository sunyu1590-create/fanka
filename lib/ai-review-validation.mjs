/**
 * HEIKA 内容审核判定（策略 3.0：正常内容默认通过）。
 *
 * 设计原则：
 * 1. 默认 PASS。模型没有给出「明确违规」的结论时，一律不拦截、不转人工。
 * 2. 不确定性不是违规依据：riskLevel=uncertain / 解析异常 / 证据无法在原文定位，
 *    都不构成复审或驳回理由。
 * 3. 只有「明确的高风险类别 + 可在原文逐字定位的证据」才允许 REJECT；
 *    中风险且有有效证据才 REVIEW。
 * 4. 模型输出格式错误不等于内容违规，返回 PASS 并标记 degraded，交由后续统计观察。
 */

/** 允许触发拦截的明确违规类别（与平台规则一一对应）。 */
export const ENFORCED_CATEGORIES = new Set([
  "extremism",            // 极端主义、恐怖主义
  "political_violation",  // 明确违反平台涉政规则
  "commercial_spam",      // 商业广告、恶意营销
  "malicious_redirect",   // 恶意引流、导流诈骗
  "fraud",                // 诈骗、欺诈
  "violent_threat",       // 严重暴力威胁
  "malware",              // 恶意软件、木马、钓鱼
  "serious_illegal",      // 严重违法（毒品、赌博、色情交易等）
  "privacy_violation",    // 侵犯个人隐私、人肉曝光
]);

/** 模型可能返回的中文类别，统一映射到上表。 */
const CATEGORY_ALIASES = new Map([
  ["极端主义", "extremism"], ["恐怖主义", "extremism"], ["暴恐", "extremism"],
  ["涉政", "political_violation"], ["政治", "political_violation"], ["违反涉政规则", "political_violation"],
  ["商业广告", "commercial_spam"], ["广告", "commercial_spam"], ["营销", "commercial_spam"],
  ["恶意引流", "malicious_redirect"], ["引流", "malicious_redirect"], ["导流", "malicious_redirect"],
  ["诈骗", "fraud"], ["欺诈", "fraud"],
  ["暴力威胁", "violent_threat"], ["严重暴力", "violent_threat"], ["威胁", "violent_threat"],
  ["恶意软件", "malware"], ["木马", "malware"], ["钓鱼", "malware"], ["病毒", "malware"],
  ["严重违法", "serious_illegal"], ["毒品", "serious_illegal"], ["赌博", "serious_illegal"], ["色情交易", "serious_illegal"],
  ["侵犯隐私", "privacy_violation"], ["人肉", "privacy_violation"], ["隐私", "privacy_violation"],
]);

const RISK_LEVELS = new Set(["clear", "low", "medium", "high", "uncertain"]);
const DECISIONS = new Set(["pass", "review", "reject", "approve"]);

function normalizeCategory(value) {
  const raw = String(value || "").trim().toLowerCase().slice(0, 60);
  if (!raw) return null;
  if (ENFORCED_CATEGORIES.has(raw)) return raw;
  return CATEGORY_ALIASES.get(String(value).trim()) || null;
}

function safeReason(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
}

/**
 * @param {string} output 模型原始输出（可能是 JSON、带代码围栏的 JSON 或纯文本）
 * @param {string} body 作品原文，用于校验证据是否真实存在
 * @param {{ policyVersion?: string }} [options]
 */
export function validateAiReview(output, body, options = {}) {
  const policyVersion = options.policyVersion || "3.0";
  let parsed = null;
  let parseError = false;
  try {
    const text = String(output ?? "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value;
    else parseError = true;
  } catch {
    parseError = true;
  }

  const source = typeof body === "string" ? body : "";
  const rawDecision = typeof parsed?.decision === "string" ? parsed.decision.trim().toLowerCase() : "";
  const riskLevel = typeof parsed?.riskLevel === "string" && RISK_LEVELS.has(parsed.riskLevel)
    ? parsed.riskLevel
    : "uncertain";
  const riskTypes = Array.isArray(parsed?.riskTypes)
    ? [...new Set(parsed.riskTypes.map(normalizeCategory).filter(Boolean))].slice(0, 8)
    : [];
  const rawEvidence = Array.isArray(parsed?.evidence)
    ? parsed.evidence.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8)
    : [];
  // 证据必须能在原文中逐字定位；模型编造或不精确的引用一律作废。
  const evidence = rawEvidence.filter((excerpt) => excerpt.length >= 4 && source.includes(excerpt));
  const evidenceValid = evidence.length > 0;
  const reason = safeReason(parsed?.reason);

  let decision = "PASS";
  let reasonCode = "default_pass";

  if (parseError || !parsed) {
    reasonCode = "parse_error_pass";
  } else if (!DECISIONS.has(rawDecision)) {
    reasonCode = "unknown_decision_pass";
  } else if (rawDecision === "reject") {
    // 驳回必须同时满足：属于强制拦截类别 + 高风险 + 原文可定位证据。
    // 历史、学术、普通争议这类标签不在强制集合里，不能只凭关键词定罪。
    const enforced = riskTypes.some((type) => ENFORCED_CATEGORIES.has(type));
    if (enforced && riskLevel === "high" && evidenceValid) {
      decision = "REJECT";
      reasonCode = "explicit_violation";
    } else if (enforced && riskLevel === "medium" && evidenceValid) {
      // 类别对、证据在，但风险只到中等：交给人工，不直接驳回。
      decision = "REVIEW";
      reasonCode = "ambiguous_but_evidenced";
    } else {
      reasonCode = "reject_without_evidence_pass";
    }
  } else if (rawDecision === "review") {
    const enforced = riskTypes.some((type) => ENFORCED_CATEGORIES.has(type));
    if (enforced && evidenceValid && (riskLevel === "medium" || riskLevel === "high")) {
      decision = "REVIEW";
      reasonCode = "ambiguous_but_evidenced";
    } else {
      reasonCode = "review_without_evidence_pass";
    }
  } else {
    // pass / approve 一律通过；即使模型附带低风险标签也不转人工。
    reasonCode = "explicit_pass";
  }

  const finalReason = decision === "PASS"
    ? (parsed ? "正常内容默认通过；未发现可定位的明确违规证据。" : "模型输出无法解析，按正常内容放行并记录异常。")
    : (reason || (decision === "REJECT" ? "命中明确违规规则。" : "存在需要人工确认的风险内容。"));

  return {
    decision,
    legacyDecision: decision === "PASS" ? "approve" : "review",
    riskLevel,
    riskTypes,
    reason: finalReason,
    reasonCode,
    evidence,
    evidenceValidated: evidenceValid,
    degraded: parseError || !parsed,
    policyVersion,
  };
}
