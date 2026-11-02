export const COMPOSER_MAX_IMAGES = 9;
export const COMPOSER_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const COMPOSER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateComposerFiles<T extends { type: string; size: number }>(files: readonly T[], existingCount: number) {
  if (existingCount + files.length > COMPOSER_MAX_IMAGES) {
    return { accepted: [] as T[], error: `一篇内容最多添加 ${COMPOSER_MAX_IMAGES} 张图片` };
  }
  const accepted = files.filter((file) => COMPOSER_IMAGE_TYPES.includes(file.type as (typeof COMPOSER_IMAGE_TYPES)[number]) && file.size > 0);
  return {
    accepted,
    error: accepted.length === files.length ? null : "仅支持有效的 JPG、PNG、WebP 图片",
  };
}
