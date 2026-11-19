function parseObject(output) {
  try {
    const value = JSON.parse(String(output).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function idSet(values) {
  return new Set((Array.isArray(values) ? values : []).map((value) => String(value)));
}

/** Validate classification against the server's current approved taxonomy. */
export function validateAiClassification(output, allowedCategoryIds, allowedTagIds) {
  const parsed = parseObject(output);
  if (!parsed || parsed.uncertain === true || parsed.confidence !== "high") {
    return { applicable: false, reason: "模型对分类不确定，保留现有分类", categoryId: null, tagIds: [] };
  }

  const categories = idSet(allowedCategoryIds);
  const tags = idSet(allowedTagIds);
  const categoryId = String(parsed.categoryId ?? "");
  if (!categories.has(categoryId)) {
    return { applicable: false, reason: "模型返回的分类不在当前有效分类目录中", categoryId: null, tagIds: [] };
  }
  if (!Array.isArray(parsed.tagIds) || parsed.tagIds.length > 5) {
    return { applicable: false, reason: "模型返回的标签数量或格式无效", categoryId: null, tagIds: [] };
  }
  const tagIds = parsed.tagIds.map((value) => String(value));
  if (new Set(tagIds).size !== tagIds.length || tagIds.some((id) => !tags.has(id))) {
    return { applicable: false, reason: "模型返回了重复或未审核的标签", categoryId: null, tagIds: [] };
  }

  return {
    applicable: true,
    reason: typeof parsed.reason === "string" ? parsed.reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300) : "分类依据未提供",
    categoryId,
    tagIds,
  };
}
