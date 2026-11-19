const RISK_LEVELS = new Set(["clear", "low", "medium", "high", "uncertain"]);

/** Validate the provider's moderation JSON against the source text before it can affect a post. */
export function validateAiReview(output, body) {
  let parsed = null;
  try {
    const value = JSON.parse(String(output).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value;
  } catch { /* malformed structured output must be sent to a human */ }

  const level = typeof parsed?.riskLevel === "string" && RISK_LEVELS.has(parsed.riskLevel) ? parsed.riskLevel : "uncertain";
  const risks = Array.isArray(parsed?.riskTypes)
    ? parsed.riskTypes.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 8)
    : [];
  const evidence = Array.isArray(parsed?.evidence)
    ? parsed.evidence.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 400)).filter(Boolean).slice(0, 8)
    : [];
  const reason = typeof parsed?.reason === "string" ? parsed.reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 600) : "模型输出缺少可验证的审核说明";
  const fabricatedEvidence = evidence.some((excerpt) => !body.includes(excerpt));
  const valid = (parsed?.decision === "approve" || parsed?.decision === "review") && RISK_LEVELS.has(String(parsed?.riskLevel)) && reason.length >= 3;
  const decision = valid && !fabricatedEvidence && parsed?.decision === "approve" && level === "clear" && risks.length === 0 && evidence.length === 0
    ? "approve"
    : "review";

  return {
    decision,
    riskLevel: level,
    riskTypes: risks,
    reason: fabricatedEvidence ? "模型引用的可疑内容无法在原文中定位，已转人工复审。" : reason || "模型未提供可验证的审核说明",
    evidence: fabricatedEvidence ? evidence.filter((excerpt) => body.includes(excerpt)) : evidence,
    evidenceValidated: !fabricatedEvidence,
  };
}
