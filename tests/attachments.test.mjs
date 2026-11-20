import test from "node:test";
import assert from "node:assert/strict";
import { isPreviewableAttachment } from "../lib/attachments.ts";

test("only passive document and image attachments may open inline", () => {
  for (const name of ["notes.pdf", "notes.md", "data.json", "chart.webp", "table.csv"]) {
    assert.equal(isPreviewableAttachment(name), true, `${name} should be previewable`);
  }
  for (const name of ["setup.apk", "tool.exe", "code.js", "run.sh", "bundle.zip", "archive.docx"]) {
    assert.equal(isPreviewableAttachment(name), false, `${name} should be downloaded only`);
  }
});

test("attachment content signatures must match the claimed extension", async () => {
  const { attachmentContentMatches } = await import("../lib/attachments.ts");
  const bytesOf = (...values) => new Uint8Array(values);
  const ascii = (text) => new TextEncoder().encode(text);

  assert.equal(attachmentContentMatches("apk", bytesOf(0x50, 0x4b, 0x03, 0x04)), true);
  assert.equal(attachmentContentMatches("docx", bytesOf(0x50, 0x4b, 0x03, 0x04)), true);
  assert.equal(attachmentContentMatches("apk", ascii("not a package")), false);
  assert.equal(attachmentContentMatches("png", bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), true);
  assert.equal(attachmentContentMatches("png", ascii("plain text")), false);
  assert.equal(attachmentContentMatches("pdf", ascii("%PDF-1.7")), true);
  assert.equal(attachmentContentMatches("pdf", ascii("MZ fake")), false);
  assert.equal(attachmentContentMatches("jpg", bytesOf(0xff, 0xd8, 0xff, 0xe0)), true);
  assert.equal(attachmentContentMatches("gz", bytesOf(0x1f, 0x8b, 0x08)), true);
  assert.equal(attachmentContentMatches("exe", ascii("MZ\x90\x00")), true);
  assert.equal(attachmentContentMatches("7z", bytesOf(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)), true);
  assert.equal(attachmentContentMatches("rar", bytesOf(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)), true);
  const tar = new Uint8Array(300);
  tar.set(ascii("ustar"), 257);
  assert.equal(attachmentContentMatches("tar", tar), true);
  assert.equal(attachmentContentMatches("md", ascii("# 标题\n正文")), true);
  assert.equal(attachmentContentMatches("json", ascii("{\"a\":1}")), true);
  assert.equal(attachmentContentMatches("json", bytesOf(0x00, 0x01, 0x02)), false);
});
