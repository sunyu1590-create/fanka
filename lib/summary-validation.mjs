const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("zh-CN", { granularity: "word" })
  : null;
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const SPACED_CJK_PATTERN = /[\u3400-\u9fff][ \t]+[\u3400-\u9fff]/;

export function summaryWordCount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (segmenter) return Array.from(segmenter.segment(text)).filter((part) => part.isWordLike).length;
  return text.split(/\s+/u).filter(Boolean).length;
}

export function summaryCharacterCount(value) {
  return Array.from(String(value || "").trim()).length;
}

// 中文按汉字数控制长度，拉丁文本仍按词数控制：Intl.Segmenter 会把一段中文
// 切成上百个“词”，直接套用 50 词上限会让正常的中文摘要几乎全部判失败。
export function validateSummary(value, { maxWords = 50, maxCharacters = 600, cjkMaxCharacters = 160 } = {}) {
  const text = String(value || "").trim();
  if (!text || summaryCharacterCount(text) > maxCharacters) return false;
  const cjkCount = (text.match(CJK_PATTERN) || []).length;
  const spacedCjk = SPACED_CJK_PATTERN.test(text);
  if (cjkCount >= 20 && !spacedCjk) return cjkCount <= cjkMaxCharacters;
  return summaryWordCount(text) <= maxWords;
}
