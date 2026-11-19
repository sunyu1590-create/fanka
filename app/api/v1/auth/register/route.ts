import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { clientIp } from "@/lib/server/client-ip";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE = /already|registered|exists|duplicate/i;

/** 每小时同一 IP 最多成功注册的账号数。 */
const SIGNUP_LIMIT_PER_IP = 2;
const SIGNUP_WINDOW_MINUTES = 60;

async function claimSignupSlot(ip: string) {
  const db = adminClient();
  const { data, error } = await db.rpc("claim_signup_slot", {
    p_ip: ip,
    p_limit: SIGNUP_LIMIT_PER_IP,
    p_window_minutes: SIGNUP_WINDOW_MINUTES,
  });
  if (error) throw new ApiError(503, "注册服务暂不可用，请稍后重试");
  // PostgREST 可能把 bigint 序列化成字符串，两种都接受。
  const value = typeof data === "number" ? data : typeof data === "string" ? Number(data) : NaN;
  return Number.isFinite(value) ? value : null;
}

async function releaseSignupSlot(slot: number | null) {
  if (slot == null) return;
  await adminClient().from("signup_ip_slots").delete().eq("id", slot);
}

/**
 * 注册入口（网页与原生客户端共用）。
 *
 * Supabase 自带的 signup 需要邮箱确认或验证码，原生 App 的验证码通道在
 * 当前后端不可用，因此这里由服务端直接用 service role 建号并把邮箱标记为
 * 已确认，随后客户端用邮箱密码登录即可。
 *
 * 安全：同一 IP 每小时最多成功注册 2 个账号，名额在服务端原子抢占，
 * 注册失败会立刻释放，避免邮箱已存在之类的失败白占额度。
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const body = await jsonBody(req);
    const email = textField(body.email, "邮箱", 3, 254).toLowerCase();
    if (!EMAIL.test(email)) throw new ApiError(400, "邮箱格式不正确");
    const password = textField(body.password, "密码", 8, 128);
    const rawNickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    const nickname = rawNickname ? textField(rawNickname, "昵称", 1, 24) : email.split("@")[0].slice(0, 24);
    let inviteCodeHash: string | null = null;
    if (body.inviteCode !== undefined && body.inviteCode !== null && body.inviteCode !== "") {
      if (typeof body.inviteCode !== "string") throw new ApiError(400, "入驻邀请码格式无效");
      const inviteCode = body.inviteCode.trim().toUpperCase().replace(/\s/g, "");
      if (!/^HEIKA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(inviteCode)) throw new ApiError(400, "入驻邀请码格式无效");
      inviteCodeHash = createHash("sha256").update(inviteCode, "utf8").digest("hex");
      const admin = adminClient();
      const found = await admin.from("access_codes").select("id,batch_id,status").eq("code_hash", inviteCodeHash).maybeSingle();
      dbError(found.error);
      const batch = found.data ? await admin.from("access_code_batches").select("code_kind,active,expires_at").eq("id", found.data.batch_id).maybeSingle() : { data: null, error: null };
      dbError(batch.error);
      if (!found.data || found.data.status !== "unused" || batch.data?.code_kind !== "invitation" || !batch.data.active || (batch.data.expires_at && Date.parse(batch.data.expires_at) <= Date.now())) {
        throw new ApiError(400, "入驻邀请码无效、已使用或已过期");
      }
    }

    const ip = clientIp(req);
    const slot = ip ? await claimSignupSlot(ip) : null;
    if (ip && slot == null) {
      throw new ApiError(429, `当前网络注册次数已达上限（每 IP ${SIGNUP_LIMIT_PER_IP} 个/小时），请稍后再试或更换网络。`);
    }

    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: nickname },
    });

    if (error) {
      await releaseSignupSlot(slot);
      if (DUPLICATE.test(error.message)) throw new ApiError(409, "该邮箱已注册，请直接登录");
      throw new ApiError(400, error.message || "注册失败，请稍后重试");
    }

    const uid = data.user?.id;
    if (!uid) {
      await releaseSignupSlot(slot);
      throw new ApiError(500, "注册失败，请稍后重试");
    }

    // 触发器可能已经建好资料行，这里只补昵称，失败不影响建号结果。
    await db.from("profiles").update({ nickname }).eq("id", uid);
    if (slot != null) await db.from("signup_ip_slots").update({ email }).eq("id", slot);

    let invitation: unknown = null;
    if (inviteCodeHash) {
      const redeemed = await db.rpc("redeem_access_code", { p_code_hash: inviteCodeHash, p_user_id: uid, p_signup: true });
      if (redeemed.error || !redeemed.data) {
        await db.auth.admin.deleteUser(uid);
        await releaseSignupSlot(slot);
        const reason = redeemed.error?.message || "入驻邀请码兑换失败";
        if (/unavailable|already has|only be used|must be redeemed/i.test(reason)) throw new ApiError(409, "入驻邀请码刚刚失效，请更换邀请码后重试");
        throw new ApiError(503, "邀请码奖励暂不可用，请稍后重试");
      }
      invitation = redeemed.data;
    }

    return { uid, email, invitation };
  });
}
