export const EXPERIENCE_LEVELS = [
  { level: 1, threshold: 0, reward: "黑卡探索者" },
  { level: 2, threshold: 100, reward: "LV2 探索徽章" },
  { level: 3, threshold: 240, reward: "头像边框" },
  { level: 4, threshold: 430, reward: "专属卡背" },
  { level: 5, threshold: 680, reward: "置顶收藏位 +1" },
  { level: 6, threshold: 1000, reward: "个人页主题色" },
  { level: 7, threshold: 1390, reward: "翻卡揭晓动效" },
  { level: 8, threshold: 1850, reward: "置顶内容位 +1" },
  { level: 9, threshold: 2380, reward: "探索者专属称号" },
  { level: 10, threshold: 2980, reward: "黑卡收藏家边框" },
] as const;

export function levelForExperience(total: number) {
  return [...EXPERIENCE_LEVELS].reverse().find((item) => total >= item.threshold) || EXPERIENCE_LEVELS[0];
}

export function experienceProgress(total: number) {
  const current = levelForExperience(total);
  const next = EXPERIENCE_LEVELS.find((item) => item.level === current.level + 1);
  return {
    current,
    next,
    currentLevelXp: Math.max(0, total - current.threshold),
    nextLevelXp: next ? next.threshold - current.threshold : 0,
    percent: next ? Math.min(100, Math.round(((total - current.threshold) / (next.threshold - current.threshold)) * 100)) : 100,
  };
}

export type CardRarityTier = "ordinary" | "S" | "SS" | "SSS" | "pending";
export type CardRarity = "评分形成中" | "普通黑卡" | "S" | "SS" | "SSS";

export function cardRarityTier(average: number, count: number): CardRarityTier {
  if (count < 5) return "pending";
  if (average >= 4.8 && count >= 20) return "SSS";
  if (average >= 4.5 && count >= 10) return "SS";
  if (average >= 4 && count >= 5) return "S";
  return "ordinary";
}

export function cardRarityLabel(tier: CardRarityTier): CardRarity {
  if (tier === "pending") return "评分形成中";
  if (tier === "ordinary") return "普通黑卡";
  return tier;
}

export function cardRarity(average: number, count: number): CardRarity {
  return cardRarityLabel(cardRarityTier(average, count));
}
