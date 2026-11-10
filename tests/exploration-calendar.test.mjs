import test from "node:test";
import assert from "node:assert/strict";
import { explorationDayKey, explorationStreak, localMonthStartUtc } from "../lib/exploration-calendar.ts";

test("calendar month boundaries follow the profile timezone across daylight saving changes", () => {
  assert.equal(localMonthStartUtc("2024-03", "America/New_York").toISOString(), "2024-03-01T05:00:00.000Z");
  assert.equal(localMonthStartUtc("2024-04", "America/New_York").toISOString(), "2024-04-01T04:00:00.000Z");
  assert.equal(explorationDayKey("2024-03-01T04:30:00.000Z", "America/New_York"), "2024-02-29");
});

test("exploration streak uses server profile dates and tolerates a missed current day", () => {
  const now = new Date("2024-03-04T12:00:00.000Z");
  const opened = ["2024-03-03T10:00:00.000Z", "2024-03-02T10:00:00.000Z", "2024-03-01T10:00:00.000Z"];
  assert.deepEqual(explorationStreak(opened, "Asia/Shanghai", now), { today: "2024-03-04", streak: 3 });
  assert.deepEqual(explorationStreak(["2024-03-01T10:00:00.000Z"], "Asia/Shanghai", now), { today: "2024-03-04", streak: 0 });
});

test("calendar month validation rejects malformed values and timezones", () => {
  assert.throws(() => localMonthStartUtc("2024-13", "Asia/Shanghai"), /Invalid year-month/);
  assert.throws(() => localMonthStartUtc("2024-03", "Not/A_Timezone"));
});
