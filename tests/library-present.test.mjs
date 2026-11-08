import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = (await readFile(new URL("../lib/server/library.ts", import.meta.url), "utf8"))
  .replace('import { signPostMedia } from "./media";', 'const signPostMedia = async (db, paths, expiresIn) => db.signPostMedia(paths, expiresIn);');
const moduleSource = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { libraryFields, libraryFeedFields, present, presentMany } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);

test("content queries disambiguate category and topic foreign keys", () => {
  assert.match(libraryFields, /interest_tags!posts_tag_id_fkey\(name\)/);
  assert.match(libraryFields, /profiles!posts_author_id_fkey\(nickname,avatar_url\)/);
  assert.match(libraryFields, /post_topics\(interest_tags!post_topics_topic_id_fkey\(name\)\)/);
  assert.match(libraryFeedFields, /body_excerpt/);
  assert.doesNotMatch(libraryFeedFields, /,body,/);
});

test("content mapper retains category, topics, and ordered media", () => {
  const post = present({
    id: "post-1", client_id: 17, title: "标题", body: "正文", cover_text: "封面",
    image_url: null, author_id: "user-1", created_at: "2026-11-01T10:00:00.000Z",
    is_demo: true, status: "published", interest_tags: { name: "生活" },
    profiles: { nickname: "作者", avatar_url: "https://storage.test/avatar.webp" }, post_media: [
      { storage_path: "user-1/second.webp", sort_order: 1 },
      { storage_path: "user-1/first.webp", sort_order: 0 },
    ], post_topics: [{ interest_tags: { name: "生活" } }, { interest_tags: { name: "摄影" } }],
  });
  assert.equal(post.tag, "生活");
  assert.deepEqual(post.topics, ["生活", "摄影"]);
  assert.equal(post.id, 17);
  assert.equal(post.authorAvatar, "https://storage.test/avatar.webp");
  assert.match(post.images[0], /first\.webp/);
  assert.match(post.images[1], /second\.webp/);
});

test("feed presenter prefers signed thumbnails and keeps detail originals separate", () => {
  const row = {
    id: "post-2", client_id: 18, title: "标题", body_excerpt: "短摘要", cover_text: null,
    image_url: null, author_id: "user-2", created_at: "2026-11-01T10:00:00.000Z",
    is_demo: false, status: "published", interest_tags: { name: "摄影" },
    profiles: { nickname: "作者" }, post_media: [
      { storage_path: "user-2/photo.jpg", thumbnail_path: "user-2/photo-480.webp", retina_thumbnail_path: "user-2/photo-960.webp", sort_order: 0 },
    ], post_topics: [],
  };
  const urls = new Map([
    ["user-2/photo-480.webp", "https://storage.test/photo-480?token=low"],
    ["user-2/photo-960.webp", "https://storage.test/photo-960?token=high"],
  ]);
  const post = present(row, urls, true);
  assert.equal(post.body, "短摘要");
  assert.equal(post.isPartial, true);
  assert.equal(post.image, "https://storage.test/photo-480?token=low");
  assert.equal(post.imageRetina, "https://storage.test/photo-960?token=high");
  assert.equal(post.thumbnailImages[0], "https://storage.test/photo-480?token=low");
  assert.equal(post.retinaImages[0], "https://storage.test/photo-960?token=high");
  const detail = present(row, urls, false);
  assert.match(detail.images[0], /photo\.jpg/);
});

test("failed storage signing does not make post details unavailable", async () => {
  const row = {
    id: "post-3", client_id: 19, title: "媒体暂时不可用", body: "正文", cover_text: null,
    image_url: null, author_id: "user-3", created_at: "2026-11-01T10:00:00.000Z",
    is_demo: false, status: "published", interest_tags: { name: "生活" },
    profiles: { nickname: "作者" }, post_media: [
      { storage_path: "user-3/photo.jpg", sort_order: 0 },
    ], post_topics: [],
  };
  const db = {
    signPostMedia: async (paths) => paths.includes("user-3/photo.jpg")
      ? { data: null, error: new Error("storage temporarily unavailable") }
      : { data: [], error: null },
  };

  const [post] = await presentMany(db, [row]);
  assert.equal(post.title, "媒体暂时不可用");
  assert.match(post.images[0], /\/api\/v1\/media\?path=/);
});
