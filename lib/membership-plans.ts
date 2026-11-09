export type MembershipTier = "free" | "plus" | "pro";

export const MEMBERSHIP_PLANS = [
  { id: "free", name: "Free", dailyFlips: 5, previewPrice: "免费" },
  { id: "plus", name: "Plus", dailyFlips: 9, previewPrice: "¥12", note: "每月预览价" },
  { id: "pro", name: "Pro", dailyFlips: 13, previewPrice: "¥16", note: "每月预览价" },
] as const;

/** Base allowance only. Existing bonuses must continue to be added by their existing logic. */
export function baseDailyFlipAllowance(tier: MembershipTier): number {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === tier)?.dailyFlips ?? MEMBERSHIP_PLANS[0].dailyFlips;
}
