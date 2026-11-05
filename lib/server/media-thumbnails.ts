import sharp from "sharp";

export async function createMediaThumbnails(source: Buffer) {
  const pipeline = sharp(source, { limitInputPixels: 40_000_000, failOn: "warning" }).rotate();
  const [thumbnail, retina] = await Promise.all([
    pipeline.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer(),
    pipeline.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 86, effort: 4 }).toBuffer(),
  ]);
  return { thumbnail, retina };
}
