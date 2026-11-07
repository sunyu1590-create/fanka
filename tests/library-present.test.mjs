import test from "node:test";
import assert from "node:assert/strict";
import { libraryFields, present } from "../lib/server/library.ts";
import { feedImageSource } from "../lib/feed-images.ts";
import { createFeedThumbnail } from "../lib/server/feed-thumbnail.ts";
import sharp from "sharp";

test("content queries disambiguate category and topic foreign keys", () => {
  assert.match(libraryFields, /interest_tags!posts_tag_id_fkey\(name\)/);
  assert.match(libraryFields, /post_topics\(interest_tags!post_topics_topic_id_fkey\(name\)\)/);
});

test("content mapper retains category, topics, and ordered media", () => {
  const post = present({
    id: "post-1", client_id: 17, title: "标题", body: "正文", cover_text: "封面",
    image_url: null, author_id: "user-1", created_at: "2026-11-01T10:00:00.000Z",
    is_demo: true, status: "published", interest_tags: { name: "生活" },
    profiles: { nickname: "作者" }, post_media: [
      { storage_path: "user-1/second.webp", sort_order: 1 },
      { storage_path: "user-1/first.webp", sort_order: 0 },
    ], post_topics: [{ interest_tags: { name: "生活" } }, { interest_tags: { name: "摄影" } }],
  });
  assert.equal(post.tag, "生活");
  assert.deepEqual(post.topics, ["生活", "摄影"]);
  assert.equal(post.id, 17);
  assert.match(post.images[0], /first\.webp/);
  assert.match(post.images[1], /second\.webp/);
});

test("discovery feed uses a server thumbnail for private uploaded media", () => {
  assert.equal(
    feedImageSource("/api/v1/media?path=user%2Fimage.jpg&redirect=1"),
    "/api/v1/media?path=user%2Fimage.jpg&redirect=1&variant=feed",
  );
});

test("discovery feed requests a smaller Unsplash image and preserves other sources", () => {
  const optimizedSource = feedImageSource("https://images.unsplash.com/photo-123?auto=format&w=1600&q=90");
  assert.ok(optimizedSource);
  const optimized = new URL(optimizedSource);
  assert.equal(optimized.searchParams.get("w"), "640");
  assert.equal(optimized.searchParams.get("q"), "76");
  assert.equal(optimized.searchParams.get("auto"), "format");
  assert.equal(feedImageSource("https://cdn.example.test/image.jpg"), "https://cdn.example.test/image.jpg");
  assert.equal(feedImageSource("data:image/svg+xml,%3Csvg/%3E"), "data:image/svg+xml,%3Csvg/%3E");
});

test("feed thumbnail is WebP, bounded to feed dimensions, and does not enlarge small sources", async () => {
  const large = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#334455" } }).png().toBuffer();
  const largeThumbnail = await createFeedThumbnail(large);
  const largeMetadata = await sharp(largeThumbnail).metadata();
  assert.equal(largeMetadata.format, "webp");
  assert.equal(largeMetadata.width, 640);
  assert.equal(largeMetadata.height, 360);

  const small = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#334455" } }).png().toBuffer();
  const smallThumbnail = await createFeedThumbnail(small);
  const smallMetadata = await sharp(smallThumbnail).metadata();
  assert.equal(smallMetadata.width, 320);
  assert.equal(smallMetadata.height, 200);
});
