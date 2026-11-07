import sharp from "sharp";

export function createFeedThumbnail(source: Buffer): Promise<Buffer> {
  return sharp(source, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 800, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 3 })
    .toBuffer();
}
