import assert from "node:assert/strict";
import test from "node:test";
import { appendUniqueById } from "../lib/feed-collection.ts";

test("feed pagination appends only unseen ids while preserving existing posts", () => {
  const first = { id: 1, title: "first" };
  const second = { id: 2, title: "second" };
  const current = [first, second];
  const page = [
    { id: 2, title: "duplicate page row" },
    { id: 3, title: "third" },
    { id: 3, title: "duplicate in page" },
  ];

  const result = appendUniqueById(current, page);

  assert.deepEqual(result.map((item) => item.id), [1, 2, 3]);
  assert.equal(result[0], first);
  assert.equal(result[1], second);
  assert.equal(result[2], page[1]);
  assert.notEqual(result, current);
});

test("feed pagination preserves array identity when a page contains no new posts", () => {
  const current = [{ id: 1 }, { id: 2 }];

  assert.equal(appendUniqueById(current, [{ id: 1 }, { id: 2 }]), current);
  assert.equal(appendUniqueById(current, []), current);
});
