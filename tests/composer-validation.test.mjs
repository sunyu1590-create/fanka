import test from "node:test";
import assert from "node:assert/strict";
import { validateComposerFiles, COMPOSER_MAX_IMAGE_BYTES, COMPOSER_MAX_IMAGES } from "../lib/composer-validation.ts";
import { validateTopicNames, MAX_POST_TOPICS } from "../lib/topic-validation.ts";
import { tags } from "../lib/content.ts";
import { topicDescriptions } from "../lib/topics.ts";

test("上传前接受受支持图片格式，大小由压缩阶段和服务器限制", () => {
  const files = [
    { name: "ok.jpg", type: "image/jpeg", size: COMPOSER_MAX_IMAGE_BYTES },
    { name: "compressible.png", type: "image/png", size: COMPOSER_MAX_IMAGE_BYTES + 1 },
    { name: "unsupported.gif", type: "image/gif", size: 1024 },
    { name: "empty.webp", type: "image/webp", size: 0 },
  ];
  const result = validateComposerFiles(files, 0);
  assert.deepEqual(result.accepted.map((file) => file.name), ["ok.jpg", "compressible.png"]);
  assert.match(result.error, /JPG、PNG、WebP/);
});

test("发布图片最多 9 张，超限时整组选图不会加入", () => {
  const files = Array.from({ length: 2 }, (_, i) => ({ name: `${i}.jpg`, type: "image/jpeg", size: 1024 }));
  const result = validateComposerFiles(files, COMPOSER_MAX_IMAGES - 1);
  assert.equal(result.accepted.length, 0);
  assert.match(result.error, /最多添加 9 张/);
});

test("话题只接受官方目录，限制数量且拒绝重复", () => {
  assert.deepEqual(validateTopicNames(["生活", "摄影"], tags).names, ["生活", "摄影"]);
  assert.match(validateTopicNames(["生活", "生活"], tags).error, /不能重复/);
  assert.match(validateTopicNames(["不存在的话题"], tags).error, /精选话题/);
  assert.match(validateTopicNames(Array.from({ length: MAX_POST_TOPICS + 1 }, () => "生活"), tags).error, /最多选择/);
});

test("每个官方分类都有可用的话题说明", () => {
  assert.deepEqual(Object.keys(topicDescriptions).sort(), [...tags].sort());
  assert.ok(Object.values(topicDescriptions).every((description) => description.trim().length > 0));
});
