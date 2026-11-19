export type ValidatedAiClassification = {
  applicable: boolean;
  reason: string;
  categoryId: string | null;
  tagIds: string[];
};
export function validateAiClassification(output: string, allowedCategoryIds: Array<string | number>, allowedTagIds: Array<string | number>): ValidatedAiClassification;
