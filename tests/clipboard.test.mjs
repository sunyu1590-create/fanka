import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePastedText, sanitizePastedText } from "../lib/clipboard.ts";

test("粘贴纯文本会去掉零宽字符、统一换行并压缩空行", () => {
  const input = "第一行\r\n\r\n\r\n第二行\u200b有零宽\uFEFF字符   \n\n\n";
  const output = sanitizePastedText(input);
  assert.equal(output, "第一行\n\n第二行有零宽字符");
});

test("粘贴纯文本不会改动正常段落", () => {
  const input = "标题\n\n正文第一段\n正文第二段";
  assert.equal(sanitizePastedText(input), input);
});

test("没有富文本时 resolvePastedText 直接返回清洗后的纯文本", () => {
  assert.equal(resolvePastedText("  一段文字  ", ""), "一段文字");
  assert.equal(resolvePastedText("", ""), "");
});

test("服务端没有 DOM 时不会抛错，退回纯文本", () => {
  // node 环境没有 document，htmlToMarkdown 必须安全返回空串。
  const plain = "一段文字";
  assert.equal(resolvePastedText(plain, "<p>一段文字</p>"), plain);
});
