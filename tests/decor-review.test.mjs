import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moderation = await readFile(new URL("../components/AdminModeration.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../components/AdminDecorReview.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/v1/admin/decor-themes/route.ts", import.meta.url), "utf8");
const decorCenter = await readFile(new URL("../components/DecorCenter.tsx", import.meta.url), "utf8");

test("装扮审核作为独立模块挂在现有管理后台内，而不是新建重复后台", () => {
  assert.match(moderation, /"decor-review"/);
  assert.match(moderation, /id: "decor-review", title: "装扮审核"/);
  assert.match(moderation, /"decor-review": "装扮审核"/);
  assert.match(moderation, /section === "decor-review" \? <AdminDecorReview \/>/);
});

test("审核接口在后端做管理员校验，前端显隐不作为权限", () => {
  assert.match(route, /import \{ requireAdmin \} from "@\/lib\/server\/require-admin"/);
  assert.match(route, /export async function GET[\s\S]*?await requireAdmin\(req\)/);
  assert.match(route, /export async function POST[\s\S]*?await requireAdmin\(req\)/);
});

test("审核面板提供待审/通过/驳回/已发布/历史与驳回原因", () => {
  assert.match(panel, /pending/);
  assert.match(panel, /approved/);
  assert.match(panel, /rejected/);
  assert.match(panel, /delisted/);
  assert.match(panel, /驳回必须说明原因/);
  assert.match(panel, /note\.length < 3/);
  assert.match(panel, /review_note/);
});

test("装扮创作上传入口不再被折叠容器裁切", () => {
  const detailsIndex = decorCenter.indexOf("decor-advanced");
  const iconSectionIndex = decorCenter.indexOf("底栏图标");
  assert.ok(iconSectionIndex > 0, "缺少底栏图标区块");
  assert.ok(detailsIndex > 0, "缺少折叠容器");
  assert.ok(iconSectionIndex < detailsIndex, "底栏图标必须排在折叠容器之前，否则入口会被裁掉");
  assert.match(decorCenter, /卡面素材/);
});
