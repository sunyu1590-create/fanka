export const MAX_POST_TOPICS = 5;

export function validateTopicNames(value: unknown, officialNames: readonly string[]) {
  if (!Array.isArray(value) || value.some((topic) => typeof topic !== "string")) {
    return { names: [] as string[], error: "话题无效" };
  }
  const names = value as string[];
  if (names.length > MAX_POST_TOPICS) return { names: [] as string[], error: `最多选择 ${MAX_POST_TOPICS} 个话题` };
  if (new Set(names).size !== names.length) return { names: [] as string[], error: "话题不能重复" };
  if (names.some((name) => !officialNames.includes(name))) return { names: [] as string[], error: "只能选择黑卡精选话题" };
  return { names, error: null };
}
