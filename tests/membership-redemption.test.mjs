import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.HEIKA_REDEEM_CODE_KEY = Buffer.alloc(32, 0x5a).toString("base64");
const { decryptRedeemCode, encryptRedeemCode, generateRedeemCode, hashRedeemCode, normalizeRedeemCode } = await import("../lib/server/redeem-code.ts");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("voucher formatting, normalization, lookup and authenticated encryption round trip", () => {
  const { code, hash, suffix } = generateRedeemCode();
  assert.match(code, /^HEIKA-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(suffix, code.slice(-4));
  assert.equal(normalizeRedeemCode(`  ${code.toLowerCase().replaceAll("-", " ")}  `), code);
  assert.equal(hashRedeemCode(code), hash);
  assert.equal(decryptRedeemCode(encryptRedeemCode(code)), code);
  assert.equal(normalizeRedeemCode("HEIKA-0000-0000-0000-0000"), null);
  assert.equal(normalizeRedeemCode("HEIKA-ABCD-EFGH-IJKL-MNOP-QRST!"), null);
});

test("voucher generation uses independent high-entropy codes", () => {
  const codes = new Set(Array.from({ length: 250 }, () => generateRedeemCode().code));
  assert.equal(codes.size, 250);
});

test("membership migration preserves flip state contract and protects code inventory", async () => {
  const sql = await read("supabase/migrations/20261114120000_membership_support_redemption.sql");
  assert.match(sql, /'openedCount',coalesce\(v_opened,0\)/);
  assert.match(sql, /'openedIds',coalesce\(v_ids,'\[\]'::jsonb\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /unique\(user_id,request_id\)/);
  assert.match(sql, /unique\(code_id\)/);
  assert.match(sql, /membership_rate_limits/);
  assert.match(sql, /returns boolean language plpgsql security definer/);
  assert.match(sql, /return v_count<=p_max_count/);
  assert.match(sql, /create or replace function public\.consume_membership_rate_limit/);
  assert.match(sql, /grant execute on function public\.consume_membership_rate_limit\(uuid,text,integer,integer,uuid,text\) to service_role/);
  assert.match(sql, /grant execute on function public\.redeem_membership_code\(uuid,text,uuid\) to service_role/);
  assert.match(sql, /revoke all on public\.redeem_code_batches,public\.redeem_codes,public\.user_membership_periods,public\.redemption_records,public\.membership_events from public,anon,authenticated/);
  assert.match(sql, /from public\.membership_plans where tier=v_tier and enabled/);
  assert.match(sql, /my_membership_state\(\)/);
});

test("redeem endpoints require server-only code key and never accept a client tier grant", async () => {
  const redeem = await read("app/api/v1/membership/redeem/route.ts");
  const plan = await read("app/api/v1/membership/route.ts");
  const admin = await read("app/api/v1/admin/membership/batches/route.ts");
  assert.match(redeem, /redeemCodeConfigurationReady\(\)/);
  assert.match(redeem, /p_user_id: user!\.id/);
  assert.match(redeem, /p_code_hash: hash/);
  assert.match(redeem, /consume_membership_rate_limit/);
  assert.doesNotMatch(redeem, /body\.tier|membership_tier\s*:/);
  assert.match(plan, /private compatibility snapshot|Membership periods are the authority/);
  assert.match(admin, /requireAdmin\(req\)/);
  assert.match(admin, /Cache-Control.*no-store/);
  assert.doesNotMatch(admin, /payment_status:\s*["']paid/);
});

test("membership configuration and deployment documentation keep secrets server-side", async () => {
  const env = await read(".env.example");
  const docs = await read("docs/membership-support-implementation.md");
  const cron = JSON.parse(await read("vercel.json"));
  assert.match(env, /^HEIKA_REDEEM_CODE_KEY=/m);
  assert.match(env, /^CRON_SECRET=/m);
  assert.match(docs, /must remain stable/);
  assert.match(docs, /has not been applied to staging or production/);
  assert.equal(cron.crons[0].path, "/api/v1/cron/membership-expiry");
});

test("native membership admin contracts cover batch, export, member, plan and order APIs", async () => {
  const repo = await read("native-android/app/src/main/java/com/heika/nativeapp/data/HeikaRepository.kt");
  const screen = await read("native-android/app/src/main/java/com/heika/nativeapp/feature/settings/AdminCenterScreen.kt");
  const orders = await read("app/api/v1/admin/membership/orders/route.ts");
  assert.match(repo, /admin\/membership\/batches\/\$\{encode\(batchId\)\}\/export/);
  assert.match(repo, /This endpoint intentionally returns text\/plain/);
  assert.match(repo, /recordAdminMembershipOrder/);
  assert.match(repo, /reviewAdminMembershipOrder/);
  assert.match(screen, /AdminModuleSpec\("membership-support", "会员与赞助"/);
  assert.match(screen, /ActivityResultContracts\.CreateDocument\("text\/plain"\)/);
  assert.match(screen, /重新下载本批次明文/);
  assert.match(screen, /订单已登记为待复核；未发放会员权益/);
  assert.match(orders, /export async function POST/);
  assert.match(orders, /payment_status: "unverified"/);
  assert.match(orders, /export async function PATCH/);
  assert.match(orders, /只有完成人工核验的已付款订单才能计入已核验赞助/);
  assert.match(orders, /recordModerationAudit/);
  assert.doesNotMatch(orders, /redeem_membership_code|membership_tier\s*:/);
});
