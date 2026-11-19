const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("zh-CN", { granularity: "word" })
  : null;

export function summaryWordCount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (segmenter) return Array.from(segmenter.segment(text)).filter((part) => part.isWordLike).length;
  return text.split(/\s+/u).filter(Boolean).length;
}

export function validateSummary(value, maxWords = 50, maxCharacters = 600) {
  const text = String(value || "").trim();
  return text.length > 0 && text.length <= maxCharacters && summaryWordCount(text) <= maxWords;
}
