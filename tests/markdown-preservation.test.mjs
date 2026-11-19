import test from "node:test";
import assert from "node:assert/strict";
import { markdownPreservationIssues } from "../lib/markdown-preservation.mjs";

test("Markdown optimization accepts formatting changes while preserving code, links, images, and table data", async () => {
  const before = [
    "paragraph",
    "| key | value |",
    "| --- | --- |",
    "| a | 1 |",
    "[guide](https://example.com/docs)",
    "![cover](/media/cover.png)",
    "```ts",
    "const value = 1;",
    "```",
  ].join("\n");
  const after = before.replace("paragraph", "## paragraph");
  assert.deepEqual(markdownPreservationIssues(before, after), []);
});

test("Markdown optimization rejects changed destinations, fenced code, or table values", async () => {
  const before = "| key | value |\n| --- | --- |\n| a | 1 |\n\n[x](https://example.com)\n\n```js\nrun()\n```";
  const after = "| key | value |\n| --- | --- |\n| a | 2 |\n\n[x](https://elsewhere.example)\n\n```js\nrun(1)\n```";
  assert.equal(markdownPreservationIssues(before, after).length, 3);
});
