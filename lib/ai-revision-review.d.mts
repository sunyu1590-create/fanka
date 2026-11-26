export type RevisionDecision = {
  decision: "approve" | "reject";
  riskLevel: "clear" | "low" | "medium" | "high" | "uncertain";
  riskTypes: string[];
  evidence: string[];
  reason: string;
  reasonCode: string;
  suggestions: string[];
  degraded: boolean;
  policyVersion: string;
};

export function decideRevisionReview(
  output: string,
  nextText: string,
  options?: { policyVersion?: string; hardBlock?: boolean },
): RevisionDecision;

export function parseRevisionSuggestions(output: string): string[];
