import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createMediaThumbnails } from "../lib/server/media-thumbnails.ts";

test("server thumbnails are WebP, preserve ratio, and use the 480/960 targets", async () => {
  const source = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: "#40505a" },
  }).png().toBuffer();
  const { thumbnail, retina } = await createMediaThumbnails(source);
  const small = await sharp(thumbnail).metadata();
  const large = await sharp(retina).metadata();
  assert.deepEqual([small.format, small.width, small.height], ["webp", 480, 240]);
  assert.deepEqual([large.format, large.width, large.height], ["webp", 960, 480]);
});

test("small sources are not enlarged during thumbnail creation", async () => {
  const source = await sharp({
    create: { width: 320, height: 180, channels: 3, background: "#40505a" },
  }).png().toBuffer();
  const { thumbnail, retina } = await createMediaThumbnails(source);
  assert.deepEqual(await sharp(thumbnail).metadata().then(({ width, height }) => [width, height]), [320, 180]);
  assert.deepEqual(await sharp(retina).metadata().then(({ width, height }) => [width, height]), [320, 180]);
});
