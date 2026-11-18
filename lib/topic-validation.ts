export const MAX_POST_TOPICS = 5;

/** 话题名：2–24 个字，只允许文字、数字、下划线与连字符。 */
const TOPIC_NAME = /^[\p{L}\p{N}_-]{2,24}$/u;

/**
 * 校验发布时携带的话题。
 *
 * 话题不再要求先在后台收录：用户可以随作品创建一个新话题，即时生效、无需审核。
 * 这里只做格式约束，避免空白、标点或超长字符串进入话题库。
 */
export function validateTopicNames(value: unknown, officialNames: readonly string[] = []) {
  if (!Array.isArray(value) || value.some((topic) => typeof topic !== "string")) {
    return { names: [] as string[], error: "话题无效" };
  }
  const names = (value as string[]).map((name) => name.trim().replace(/^#+/, ""));
  if (names.length > MAX_POST_TOPICS) return { names: [] as string[], error: `最多选择 ${MAX_POST_TOPICS} 个话题` };
  if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) return { names: [] as string[], error: "话题不能重复" };
  if (names.some((name) => !TOPIC_NAME.test(name))) return { names: [] as string[], error: "话题需为 2–24 个字，不能包含空格或标点" };
  // 已收录话题排在前面，方便下游按官方优先展示；自定义话题保留原顺序。
  const official = new Set(officialNames.map((name) => name.toLocaleLowerCase()));
  const sorted = [...names].sort((a, b) => Number(official.has(b.toLocaleLowerCase())) - Number(official.has(a.toLocaleLowerCase())));
  return { names: sorted, error: null };
}
