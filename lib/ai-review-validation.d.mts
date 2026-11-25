export type ReviewDecision = "PASS" | "REVIEW" | "REJECT";

export type ValidatedAiReview = {
  decision: ReviewDecision;
  legacyDecision: "approve" | "review";
  riskLevel: "clear" | "low" | "medium" | "high" | "uncertain";
  riskTypes: string[];
  reason: string;
  reasonCode: string;
  evidence: string[];
  evidenceValidated: boolean;
  degraded: boolean;
  policyVersion: string;
};
export function validateAiReview(output: string, body: string, options?: { policyVersion?: string }): ValidatedAiReview;
export const ENFORCED_CATEGORIES: Set<string>;
