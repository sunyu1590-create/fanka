import test from "node:test";
import assert from "node:assert/strict";
import { REPORT_REASONS, validateReportInput } from "../lib/report-validation.ts";

test("举报原因必须来自固定选项", () => {
  for (const reason of REPORT_REASONS) assert.equal(validateReportInput(reason, "").error, null);
  assert.equal(validateReportInput("自行添加的原因", "").error, "请选择举报原因");
});

test("补充说明可选且限制长度与类型", () => {
  assert.deepEqual(validateReportInput("其他", undefined), { error: null, reason: "其他", note: "" });
  assert.deepEqual(validateReportInput("其他", "  请复核  "), { error: null, reason: "其他", note: "请复核" });
  assert.equal(validateReportInput("其他", "a".repeat(301)).error, "补充说明不能超过 300 字");
  assert.equal(validateReportInput("其他", 2).error, "补充说明无效");
});
