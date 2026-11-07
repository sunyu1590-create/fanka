import sharp from "sharp";

export function createFeedThumbnail(source: Buffer): Promise<Buffer> {
  return sharp(source, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 640, height: 960, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76, effort: 3 })
    .toBuffer();
}
