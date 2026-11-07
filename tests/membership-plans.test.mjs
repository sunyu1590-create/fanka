import test from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_PLANS, baseDailyFlipAllowance } from "../lib/membership-plans.ts";

test("Free, Plus, and Pro keep their compatible base daily flip allowances", () => {
  assert.equal(baseDailyFlipAllowance("free"), 5);
  assert.equal(baseDailyFlipAllowance("plus"), 9);
  assert.equal(baseDailyFlipAllowance("pro"), 13);
});

test("preview plan labels and prices remain non-transactional display data", () => {
  assert.deepEqual(MEMBERSHIP_PLANS.map(({ id, previewPrice }) => [id, previewPrice]), [
    ["free", "免费"], ["plus", "¥12"], ["pro", "¥16"],
  ]);
  assert.ok(MEMBERSHIP_PLANS.every((plan) => !("checkout" in plan) && !("payment" in plan)));
});
