export type ValidatedAiReview = {
  decision: "approve" | "review";
  riskLevel: "clear" | "low" | "medium" | "high" | "uncertain";
  riskTypes: string[];
  reason: string;
  evidence: string[];
  evidenceValidated: boolean;
};
export function validateAiReview(output: string, body: string): ValidatedAiReview;
