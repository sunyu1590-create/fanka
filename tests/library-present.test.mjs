import test from "node:test";
import assert from "node:assert/strict";
import { libraryFields, present } from "../lib/server/library.ts";

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
