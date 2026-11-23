export type SummaryStyle = {
  key: string;
  label: string;
  instruction: string;
  score: number;
};

export function detectSummaryStyle(title: string, body: string): SummaryStyle;
export function summarySystemPrompt(style: SummaryStyle): string;
