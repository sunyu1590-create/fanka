import test from "node:test";
import assert from "node:assert/strict";
import {
  officialNotificationId,
  officialNoticeIdFromNotificationId,
  pageMergedNotifications,
} from "../lib/notifications.ts";

test("system announcement IDs stay separate from ordinary notification UUIDs", () => {
  const id = "827ef30d-e914-4caf-9e7b-a45b7ea6c501";
  assert.equal(officialNotificationId(id), `official:${id}`);
  assert.equal(officialNoticeIdFromNotificationId(`official:${id}`), id);
  assert.equal(officialNoticeIdFromNotificationId(id), null);
});

test("merged notice pages sort social and system items together before slicing", () => {
  const social = [{ id: "social", created_at: "2026-11-19T10:00:00Z" }];
  const system = [
    { id: "system-new", created_at: "2026-11-19T12:00:00Z" },
    { id: "system-old", created_at: "2026-11-18T10:00:00Z" },
  ];
  assert.deepEqual(pageMergedNotifications(social, system, 1, 2).map((item) => item.id), ["system-new", "social"]);
  assert.deepEqual(pageMergedNotifications(social, system, 2, 2).map((item) => item.id), ["system-old"]);
});
