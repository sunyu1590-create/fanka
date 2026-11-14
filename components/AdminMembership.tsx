"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Clipboard, Download, KeyRound, RefreshCw, Search, ShieldCheck, UserRoundCog } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Batch = { id: string; label: string; tier: string; duration_days: number; quantity: number; active: boolean; expires_at: string | null; unused: number; redeemed: number; disabled: number; codes: { id: string; status: string }[] };
type Order = { id: string; provider_order_id: string; user_id: string; tier: string; duration_days: number; amount_cents: number; currency: string; status: string; verified_at: string | null; failure_reason: string | null; created_at: string };
type UserRow = { id: string; nickname: string; membership_tier: "free" | "plus" | "pro"; created_at: string; membership: { tier: string; starts_at: string | null; expires_at: string | null; pending_tier: string | null; pending_days: number; source: string } | null };
type AdminPlan = { tier: string; price_cents: number; currency: string; duration_days: number | null; daily_flip_allowance: number };
type Data = { stats: Record<string, number>; plans: AdminPlan[]; batches: Batch[]; orders: Order[] };
const tierName = (tier: string) => tier === "pro" ? "Pro" : tier === "plus" ? "Plus" : "Free";
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN") : "长期有效";

function MemberRow({ account, onDone }: { account: UserRow; onDone: () => void }) {
  const [tier, setTier] = useState(account.membership_tier);
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await cloudRequest(`/api/v1/admin/membership/users/${account.id}`, { tier, days: tier === "free" ? null : Number(days), reason }, "PATCH"); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "会员调整失败"); }
    finally { setBusy(false); }
  };
  return <article className="membership-admin-user-row"><span><strong>{account.nickname || "探索者"}</strong><small>{account.id} · 当前 {tierName(account.membership?.tier || account.membership_tier)} · {account.membership?.expires_at ? `到期 ${dateLabel(account.membership.expires_at)}` : "无期限/免费"}</small></span>
    <form className="membership-admin-user-controls" onSubmit={(event) => void save(event)}><select value={tier} onChange={(event) => setTier(event.target.value as UserRow["membership_tier"])} aria-label="设置会员等级"><option value="free">Free</option><option value="plus">Plus</option><option value="pro">Pro</option></select><input type="number" min="1" max="3650" value={days} disabled={tier === "free"} onChange={(event) => setDays(event.target.value)} aria-label="会员有效天数"/><input minLength={3} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="操作原因" aria-label="会员调整原因"/><button type="submit" disabled={busy}>{busy ? "保存中" : "调整"}</button>{error && <small role="alert">{error}</small>}</form>
  </article>;
}

export default function AdminMembership() {
  const [data, setData] = useState<Data | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState("plus"); const [days, setDays] = useState("30"); const [quantity, setQuantity] = useState("10"); const [label, setLabel] = useState(""); const [expiresAt, setExpiresAt] = useState("");
  const [generated, setGenerated] = useState<{ batchId: string; codes: string[] } | null>(null);
  const [codeToDisable, setCodeToDisable] = useState("");
  const [userQuery, setUserQuery] = useState(""); const [users, setUsers] = useState<UserRow[]>([]); const [searchBusy, setSearchBusy] = useState(false);
  const [orderUser, setOrderUser] = useState(""); const [orderId, setOrderId] = useState(""); const [orderTier, setOrderTier] = useState("plus"); const [orderDays, setOrderDays] = useState("30"); const [orderAmount, setOrderAmount] = useState("1200"); const [providerRef, setProviderRef] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await cloudRequest("/api/v1/admin/membership") as Data | null; if (!result) throw new Error("管理员会话已失效"); setData(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "会员管理数据加载失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const plan = data?.plans.find((item) => item.tier === orderTier);
    if (plan) { setOrderAmount(String(plan.price_cents)); setOrderDays(String(plan.duration_days || 30)); }
  }, [data, orderTier]);
  const refreshUsers = async () => { if (userQuery.trim().length < 2) return; setSearchBusy(true); setError(""); try { const result = await cloudRequest(`/api/v1/admin/membership/users?q=${encodeURIComponent(userQuery)}`) as { users: UserRow[] } | null; setUsers(result?.users || []); } catch (cause) { setError(cause instanceof Error ? cause.message : "账号查询失败"); } finally { setSearchBusy(false); } };
  const searchUsers = async (event: FormEvent) => { event.preventDefault(); await refreshUsers(); };
  const createBatch = async (event: FormEvent) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); setGenerated(null); setNotice(""); try { const result = await cloudRequest("/api/v1/admin/membership/batches", { tier, days: Number(days), quantity: Number(quantity), label, ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}) }) as { batchId: string; codes: string[] } | null; if (!result?.codes?.length) throw new Error("卡密批次已保存，但明文列表没有返回；请检查管理记录后重新生成批次。"); setGenerated(result); setNotice("卡密已生成。数据库只保留哈希，请立即复制或下载这份明文列表。"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "卡密批次创建失败"); } finally { setBusy(false); } };
  const setBatchActive = async (batch: Batch) => { try { await cloudRequest(`/api/v1/admin/membership/batches/${batch.id}`, { active: !batch.active }, "PATCH"); setNotice(batch.active ? "卡密批次已停用" : "卡密批次已恢复"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "批次状态更新失败"); } };
  const disableCode = async (codeId: string) => { try { await cloudRequest(`/api/v1/admin/membership/codes/${codeId}`, undefined, "DELETE"); setNotice("未兑换卡密已停用"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "卡密停用失败"); } };
  const disableEnteredCode = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { await cloudRequest("/api/v1/admin/membership/codes", { code: codeToDisable }, "POST"); setCodeToDisable(""); setNotice("未兑换卡密已停用；只发送了哈希匹配请求，服务端不会回显卡密。"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "卡密停用失败"); } finally { setBusy(false); } };
  const downloadCodes = () => { if (!generated) return; const blob = new Blob([generated.codes.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `heika-membership-${generated.batchId}.txt`; anchor.click(); URL.revokeObjectURL(url); };
  const copyCodes = async () => { if (!generated) return; await navigator.clipboard.writeText(generated.codes.join("\n")); setNotice("卡密已复制到剪贴板，请妥善保存。"); };
  const createOrder = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { await cloudRequest("/api/v1/admin/membership/orders", { providerOrderId: orderId, userId: orderUser, tier: orderTier, days: Number(orderDays), amountCents: Number(orderAmount), providerUserRef: providerRef || null }); setNotice("爱发电订单已登记，状态为待人工核验；尚未授予会员权益。"); setOrderId(""); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "订单登记失败"); } finally { setBusy(false); } };
  const orderPlan = data?.plans.find((plan) => plan.tier === orderTier);
  const stats = data?.stats || {};

  return <div className="membership-admin">
    <div className="membership-admin-heading"><div><span className="heika-membership-eyebrow">MEMBERSHIP / SPONSOR</span><h2>会员与赞助管理</h2></div><button className="soft-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>刷新</button></div>
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}{notice && <p className="moderation-feedback" role="status">{notice}</p>}
    {loading && !data ? <p className="moderation-empty">正在读取会员数据…</p> : <>
      <div className="membership-admin-stats">{[[stats.free,"Free 用户"],[stats.plus,"Plus 会员"],[stats.pro,"Pro 会员"],[stats.active,"当前有效会员"],[stats.redemptionsThisMonth,"本月兑换"],[stats.unusedCodes,"未兑换卡密"],[stats.verifiedOrders,`已核验订单 · ¥${((stats.verifiedAmountCents || 0)/100).toFixed(2)}`],[stats.exceptionOrders,"异常订单"]].map(([value,labelText]) => <div key={String(labelText)}><strong>{Number(value || 0).toLocaleString("zh-CN")}</strong><span>{labelText}</span></div>)}</div>

      <section className="membership-admin-panel"><h2><KeyRound size={16}/> 生成激活码批次</h2><form className="membership-admin-form" onSubmit={(event) => void createBatch(event)}>
        <label>会员档位<select value={tier} onChange={(event) => setTier(event.target.value)}><option value="plus">Plus</option><option value="pro">Pro</option></select></label>
        <label>权益天数<input type="number" min="1" max="3650" required value={days} onChange={(event) => setDays(event.target.value)}/></label>
        <label>生成数量<input type="number" min="1" max="500" required value={quantity} onChange={(event) => setQuantity(event.target.value)}/></label>
        <label>批次名称<input required maxLength={100} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：爱发电 2026-11"/></label>
        <label>兑换截止时间（可选）<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/></label>
        <button type="submit" disabled={busy}>{busy ? "正在安全生成…" : "生成卡密"}</button>
      </form>
      {generated && <div className="membership-admin-code-export"><strong>批次 {generated.batchId}</strong><small>明文只在创建时返回一次；离开此页面后无法从数据库恢复。</small><textarea readOnly value={generated.codes.join("\n")} aria-label="一次性显示的激活码"/><div><button type="button" onClick={() => void copyCodes()}><Clipboard size={14}/>复制</button><button type="button" onClick={downloadCodes}><Download size={14}/>下载 .txt</button></div></div>}
      </section>

      <section className="membership-admin-panel"><h2><Search size={16}/> 查询与调整会员</h2><form className="membership-admin-user-search" onSubmit={(event) => void searchUsers(event)}><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="昵称或完整用户 ID" minLength={2}/><button type="submit" disabled={searchBusy}><Search size={14}/>{searchBusy ? "查询中" : "查询"}</button></form>
        {users.map((account) => <MemberRow key={account.id} account={account} onDone={() => { setNotice("会员状态已更新并记录管理员操作日志。"); void load(); void refreshUsers(); }}/>)}</section>

      <section className="membership-admin-panel"><h2><UserRoundCog size={16}/> 爱发电订单人工核验</h2><p className="membership-admin-order-warning"><ShieldCheck size={15}/>当前未配置爱发电官方 API/Webhook 凭证。订单需要管理员先在爱发电后台核对订单和付款，再登记并人工确认；不会将未经核验的 Webhook 或用户自报订单当作已支付。</p>
        <form className="membership-admin-form" onSubmit={(event) => void createOrder(event)}><label>爱发电订单号<input required minLength={4} maxLength={120} value={orderId} onChange={(event) => setOrderId(event.target.value)}/></label><label>用户 ID<input required value={orderUser} onChange={(event) => setOrderUser(event.target.value)} placeholder="UUID"/></label><label>会员档位<select value={orderTier} onChange={(event) => { const value=event.target.value; setOrderTier(value); const plan=data?.plans.find((item)=>item.tier===value); if(plan){setOrderAmount(String(plan.price_cents));setOrderDays(String(plan.duration_days || 30));} }}><option value="plus">Plus</option><option value="pro">Pro</option></select></label><label>权益期限（方案配置）<input type="number" readOnly value={orderPlan?.duration_days || orderDays}/></label><label>方案金额（分）<input type="number" readOnly value={orderPlan?.price_cents ?? orderAmount}/></label><label>平台用户标识（可选）<input value={providerRef} onChange={(event) => setProviderRef(event.target.value)} maxLength={120}/></label><button type="submit" disabled={busy || !orderPlan}>登记待核验订单</button></form>
        <div className="membership-admin-results">{(data?.orders || []).map((order) => <details className="membership-admin-order" key={order.id}><summary><strong>{order.provider_order_id}</strong><span>{tierName(order.tier)} · ¥{(order.amount_cents/100).toFixed(2)} · {order.status === "verified" ? "已核验" : order.status === "pending" ? "待核验" : order.status === "invalid" ? "已标记异常" : order.status === "refunded" ? "已退款" : "状态未知"}</span></summary><small>用户 {order.user_id} · {order.duration_days} 天 · {new Date(order.created_at).toLocaleString("zh-CN")}{order.failure_reason ? ` · ${order.failure_reason}` : ""}</small>{order.status === "pending" && <OrderVerifyForm order={order} onDone={(verified) => { setNotice(verified ? "订单核验完成，会员权益已原子写入。" : "订单已标记为异常，没有发放会员权益。"); void load(); }}/>}</details>)}</div>
      </section>

      <section className="membership-admin-panel"><h2>卡密批次与库存</h2><form className="membership-admin-user-search" onSubmit={(event) => void disableEnteredCode(event)}><input value={codeToDisable} onChange={(event) => setCodeToDisable(event.target.value.toUpperCase())} placeholder="粘贴需要停用的未兑换卡密" aria-label="待停用卡密"/><button type="submit" disabled={busy || !codeToDisable.trim()}>停用卡密</button></form>{(data?.batches || []).length ? data!.batches.map((batch) => <details className="membership-admin-batch" key={batch.id}><summary><strong>{batch.label}</strong><span>{tierName(batch.tier)} · {batch.unused} 未兑换 · {batch.redeemed} 已兑换 · {batch.disabled} 已停用</span></summary><small>{batch.duration_days} 天 · 共 {batch.quantity} 个 · {batch.active ? "批次可兑换" : "批次已停用"}{batch.expires_at ? ` · 截止 ${new Date(batch.expires_at).toLocaleDateString("zh-CN")}` : ""}</small><button type="button" onClick={() => void setBatchActive(batch)}>{batch.active ? "停用整个批次" : "恢复批次"}</button><div className="membership-admin-code-list">{batch.codes.map((code) => <div key={code.id}><span>{code.status === "unused" ? "未兑换" : code.status === "redeemed" ? "已兑换" : "已停用"}<small>{code.id}</small></span>{code.status === "unused" && <button type="button" onClick={() => void disableCode(code.id)}>停用</button>}</div>)}</div></details>) : <p className="membership-admin-muted">还没有卡密批次。</p>}</section>
      <p className="membership-admin-muted">权限说明：上述管理 API 在服务端重新检查管理员角色；卡密明文不落库，订单状态只能由受权限保护的数据库函数更新。</p>
    </>}
  </div>;
}

function OrderVerifyForm({ order, onDone }: { order: Order; onDone: (verified: boolean) => void }) {
  const [reason, setReason] = useState(""); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [rejecting, setRejecting] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!confirmed || busy) return; setBusy(true); setError(""); try { await cloudRequest(`/api/v1/admin/membership/orders/${order.id}`, { reason }, "PATCH"); onDone(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "核验失败"); } finally { setBusy(false); } };
  const reject = async () => { if (busy || reason.trim().length < 3) { setError("请先填写至少 3 个字的异常说明。"); return; } setBusy(true); setError(""); try { await cloudRequest(`/api/v1/admin/membership/orders/${order.id}`, { action: "reject", reason }, "PATCH"); onDone(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "订单状态更新失败"); } finally { setBusy(false); setRejecting(false); } };
  return <form className="membership-order-verify" onSubmit={(event) => void submit(event)}><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>我已在爱发电官方后台核对该订单的付款状态、金额与用户。</label><input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="记录核验依据或异常原因"/><button type="submit" disabled={!confirmed || busy}>{busy ? "核验中" : "确认订单并发放权益"}<Check size={14}/></button><button type="button" className="membership-order-reject" disabled={busy} onClick={() => { setRejecting(true); setError(""); }}>标记为异常</button>{rejecting && <div className="membership-order-reject-confirm" role="group" aria-label="确认标记订单异常"><span>订单将标记为无效，不会发放会员权益。</span><button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void reject()}>{busy ? "处理中" : "确认标记无效"}</button><button type="button" disabled={busy} onClick={() => setRejecting(false)}>取消</button></div>}{error && <small role="alert">{error}</small>}</form>;
}
