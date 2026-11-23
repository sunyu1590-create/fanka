import sharp from "sharp";

export type MediaThumbnailResult = {
  thumbnail: Buffer;
  retina: Buffer;
  /** 按 EXIF 方向校正后的真实像素尺寸；无法解析时为 null。 */
  width: number | null;
  height: number | null;
};

/**
 * 生成 480 / 960 两档 WebP 缩略图，并顺带返回原图尺寸。
 *
 * 尺寸是详情页占位的关键：先知道宽高，图片容器才能在请求发出前定好高度，
 * 正文不会因为图片到达而整体下移。相机拍的竖图带 orientation=5..8，
 * metadata 给的是未旋转的宽高，这里按方向做一次交换，避免占位比例反了。
 */
export async function createMediaThumbnails(source: Buffer): Promise<MediaThumbnailResult> {
  const pipeline = sharp(source, { limitInputPixels: 40_000_000, failOn: "warning" }).rotate();
  const [metadata, thumbnail, retina] = await Promise.all([
    sharp(source, { limitInputPixels: 40_000_000 }).metadata().catch(() => null),
    pipeline.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer(),
    pipeline.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 86, effort: 4 }).toBuffer(),
  ]);
  const orientation = metadata?.orientation ?? 1;
  const swapped = orientation >= 5 && orientation <= 8;
  const width = metadata?.width ? (swapped ? metadata.height : metadata.width) ?? null : null;
  const height = metadata?.height ? (swapped ? metadata.width : metadata.height) ?? null : null;
  return {
    thumbnail,
    retina,
    width: width && width > 0 ? width : null,
    height: height && height > 0 ? height : null,
  };
}
