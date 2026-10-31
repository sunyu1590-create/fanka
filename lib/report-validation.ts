export const REPORT_REASONS = [
  "垃圾营销或重复内容",
  "骚扰、仇恨或攻击",
  "虚假或误导信息",
  "侵权或未经授权转载",
  "不适宜或危险内容",
  "其他",
] as const;

export function validateReportInput(reason: unknown, note: unknown) {
  if (typeof reason !== "string" || !REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    return { error: "请选择举报原因" };
  }
  if (note !== undefined && typeof note !== "string") return { error: "补充说明无效" };
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (trimmed.length > 300) return { error: "补充说明不能超过 300 字" };
  return { error: null, reason, note: trimmed };
}
