export const FEEDBACK_CATEGORIES = ["suggestion", "problem", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export function validateFeedbackInput(category: unknown, message: unknown) {
  if (!FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
    return { error: "请选择反馈分类" };
  }
  if (typeof message !== "string") return { error: "请填写反馈内容" };
  const clean = message.trim();
  if (clean.length < 10 || clean.length > 3000) {
    return { error: "反馈内容须为 10–3000 个字符" };
  }
  return { value: { category: category as FeedbackCategory, message: clean } };
}
