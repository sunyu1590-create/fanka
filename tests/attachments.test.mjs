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
