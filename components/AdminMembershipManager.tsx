"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Download, RefreshCw, Search, ShieldAlert, Ticket, UserRound, X } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { confirmInApp } from "@/lib/in-app-dialog";

type Tab = "codes" | "members" | "orders" | "plans";
type Plan = { tier: "free" | "plus" | "pro"; display_name: string; daily_flips: number; duration_days: number | null; support_price_cents: number; benefits: string[]; enabled: boolean };
type Batch = { id: string; name: string; tier: string; duration_days: number; code_count: number; export_ref: string | null; export_label: string | null; exported_at: string | null; created_at: string; available_count: number; redeemed_count: number; disabled_count: number };
type UserRow = { id: string; nickname: string; membership_tier: string; membership_expires_at: string | null; periods: { tier: string; starts_at: string; ends_at: string | null; source: string; revoked_at: string | null; revoke_reason: string | null }[]; redemptions: { tier: string; duration_days: number; effective_from: string; expires_at: string; created_at: string }[] };
type Order = { id: string; provider_order_id: string; plan_id: string | null; amount_cents: number | null; payment_status: string; processing_status: string; received_at: string; issue_note: string | null };
type Dashboard = { freeUsers: number; plusUsers: number; proUsers: number; generatedCodes: number; redeemedCodes: number; availableCodes: number; disabledCodes: number; verifiedSupportCents: number; unverifiedOrders: number };
type CodeRow = { id: string; code_suffix: string; tier: string; duration_days: number; status: string; redeemed_at: string | null; created_at: string };

function saveTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const money = (cents: number) => `¥${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export default function AdminMembershipManager() {
  const [tab, setTab] = useState<Tab>("codes");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [manageTier, setManageTier] = useState("plus");
  const [manageDays, setManageDays] = useState("30");
  const [manageReason, setManageReason] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("plus");
  const [days, setDays] = useState("30");
  const [count, setCount] = useState("10");
  const [distributionLabel, setDistributionLabel] = useState("爱发电商品 · Plus 30 天");
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [summary, batchData, planData, orderData] = await Promise.all([
        cloudRequest("/api/v1/admin/membership/summary") as Promise<Dashboard>,
        cloudRequest("/api/v1/admin/membership/batches") as Promise<{ items: Batch[] }>,
        cloudRequest("/api/v1/admin/membership/plans") as Promise<{ items: Plan[] }>,
        cloudRequest("/api/v1/admin/membership/orders") as Promise<{ items: Order[] }>,
      ]);
      setDashboard(summary); setBatches(batchData.items || []); setPlans(planData.items || []); setOrders(orderData.items || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "会员后台加载失败"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createBatch = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await cloudRequest("/api/v1/admin/membership/batches", { name, tier, durationDays: Number(days), count: Number(count), distributionLabel }) as { batch: Batch; codes: string[]; warning: string };
      saveTextFile(`HEIKA-${tier.toUpperCase()}-${days}days-${result.batch.id.slice(0, 8)}.txt`, result.codes.join("\n") + "\n");
      setName(""); setNotice(`${result.warning} 文件已下载，请存放在可信位置。`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "卡密生成失败"); }
    finally { setBusy(false); }
  };

  const exportBatch = async (batch: Batch) => {
    const label = batch.export_label || distributionLabel.trim();
    if (!label) { setError("请先填写分发商品名称"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await cloudFetch(`/api/v1/admin/membership/batches/${batch.id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, exportRef: batch.export_ref || undefined }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "卡密导出失败"); }
      const text = await response.text();
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `HEIKA-codes-${batch.export_ref || "reserved"}.txt`; anchor.click(); URL.revokeObjectURL(url);
      setNotice(`已导出至「${label}」。此批次不能再分配到其他商品。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "卡密导出失败"); }
    finally { setBusy(false); }
  };

  const viewCodes = async (batch: Batch) => {
    if (expandedBatch === batch.id) { setExpandedBatch(null); setCodes([]); return; }
    setBusy(true); setError("");
    try { const result = await cloudRequest(`/api/v1/admin/membership/batches/${batch.id}/codes`) as { items: CodeRow[] }; setCodes(result.items || []); setExpandedBatch(batch.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "卡密列表读取失败"); }
    finally { setBusy(false); }
  };

  const disableCode = async (code: CodeRow) => {
    if (!await confirmInApp(`停用末四位 ${code.code_suffix} 的卡密？停用后无法兑换。`, { title: "停用会员激活码", confirmLabel: "停用卡密", danger: true })) return;
    setBusy(true); setError("");
    try {
      await cloudRequest(`/api/v1/admin/membership/codes/${code.id}`, {}, "PATCH");
      setNotice(`卡密末四位 ${code.code_suffix} 已停用。`);
      if (expandedBatch) { const result = await cloudRequest(`/api/v1/admin/membership/batches/${expandedBatch}/codes`) as { items: CodeRow[] }; setCodes(result.items || []); }
      await load();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "卡密停用失败"); }
    finally { setBusy(false); }
  };

  const searchUsers = async (event: FormEvent) => {
    event.preventDefault(); if (query.trim().length < 2) { setError("请输入至少 2 个字符搜索用户"); return; }
    setBusy(true); setError(""); setSelectedUser(null);
    try { const result = await cloudRequest(`/api/v1/admin/membership/users?query=${encodeURIComponent(query.trim())}`) as { items: UserRow[] }; setUsers(result.items || []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "用户搜索失败"); }
    finally { setBusy(false); }
  };

  const adjustMembership = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedUser) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await cloudRequest(`/api/v1/admin/membership/users/${selectedUser.id}`, { tier: manageTier, durationDays: manageTier === "free" ? null : Number(manageDays), reason: manageReason }, "PATCH");
      setNotice(`${selectedUser.nickname || "用户"} 的会员状态已更新并记录审计。`); setManageReason("");
      const result = await cloudRequest(`/api/v1/admin/membership/users?query=${encodeURIComponent(query.trim())}`) as { items: UserRow[] }; setUsers(result.items || []); setSelectedUser(result.items?.find((item) => item.id === selectedUser.id) || null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "会员调整失败"); }
    finally { setBusy(false); }
  };

  const savePlan = async (plan: Plan) => {
    setBusy(true); setError("");
    try {
      await cloudRequest(`/api/v1/admin/membership/plans/${plan.tier}`, { dailyFlips: plan.daily_flips, priceCents: plan.support_price_cents, durationDays: plan.duration_days, enabled: plan.enabled }, "PATCH");
      setNotice(`${plan.display_name} 方案已保存，服务端额度规则同步更新。`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "方案保存失败"); }
    finally { setBusy(false); }
  };

  const tabs: [Tab, string][] = [["codes", "卡密批次"], ["members", "会员用户"], ["orders", "爱发电订单"], ["plans", "方案配置"]];
  return <div className="admin-membership-manager">
    {dashboard && <div className="admin-membership-stats">
      <div><strong>{dashboard.freeUsers}</strong><span>Free</span></div><div><strong>{dashboard.plusUsers}</strong><span>有效 Plus</span></div><div><strong>{dashboard.proUsers}</strong><span>有效 Pro</span></div><div><strong>{dashboard.availableCodes}</strong><span>未兑换卡密</span></div><div><strong>{dashboard.redeemedCodes}</strong><span>已兑换</span></div><div><strong>{money(dashboard.verifiedSupportCents)}</strong><span>已核验赞助</span></div>
    </div>}
    <div className="admin-membership-tabs" role="tablist" aria-label="会员与赞助管理">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>)}<button type="button" className="admin-membership-refresh" disabled={busy} onClick={() => void load()} aria-label="刷新会员管理"><RefreshCw size={15}/></button></div>
    {error && <p className="admin-membership-message error" role="alert">{error}</p>}{notice && <p className="admin-membership-message" role="status"><Check size={15}/>{notice}</p>}

    {tab === "codes" && <>
      <form className="admin-membership-form" onSubmit={(event) => void createBatch(event)}>
        <div><Ticket size={18}/><div><strong>生成随机回复卡密</strong><small>安全随机 100 bit 卡密；数据库保存 HMAC 与 AES-GCM 密文。</small></div></div>
        <label>批次名称<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：爱发电 Plus 11 月批次"/></label>
        <div className="admin-membership-fields"><label>等级<select value={tier} onChange={(event) => { setTier(event.target.value); setDistributionLabel(event.target.value === "pro" ? "爱发电商品 · Pro 30 天" : "爱发电商品 · Plus 30 天"); }}><option value="plus">Plus</option><option value="pro">Pro</option></select></label><label>有效天数<input type="number" min="1" max="7300" value={days} onChange={(event) => setDays(event.target.value)}/></label><label>数量<input type="number" min="1" max="1000" value={count} onChange={(event) => setCount(event.target.value)}/></label></div>
        <label>唯一分发商品 / 渠道<input required minLength={2} maxLength={120} value={distributionLabel} onChange={(event) => setDistributionLabel(event.target.value)} placeholder="爱发电商品名称"/></label>
        <button className="primary-button" disabled={busy || !name.trim() || distributionLabel.trim().length < 2}>{busy ? "处理中…" : "生成并下载卡密"}<Download size={15}/></button>
        <small>生成后立即下载一次明文文件。此批次会锁定到上述商品；已导出的同一批次可重新下载，但不可分配给其他商品。</small>
      </form>
      <div className="admin-membership-list-heading"><strong>卡密批次</strong><span>{batches.length} 批</span></div>
      {batches.map((batch) => <article className="admin-membership-batch" key={batch.id}>
        <div className="admin-membership-batch-main"><div><strong>{batch.name}</strong><small>{batch.tier.toUpperCase()} · {batch.duration_days} 天 · {batch.code_count} 张 · {new Date(batch.created_at).toLocaleString("zh-CN")}</small><small>{batch.export_label ? `已分配：${batch.export_label}` : "尚未分发"}</small></div><div className="admin-membership-batch-counts"><b>{batch.available_count}<small>可用</small></b><b>{batch.redeemed_count}<small>已兑</small></b><b>{batch.disabled_count}<small>停用</small></b></div></div>
        <div className="admin-membership-actions"><button type="button" className="soft-button" onClick={() => void exportBatch(batch)} disabled={busy || batch.available_count === 0}><Download size={14}/>{batch.export_ref ? "重新下载本商品卡密" : "导出卡密"}</button><button type="button" className="soft-button" onClick={() => void viewCodes(batch)} disabled={busy}>{expandedBatch === batch.id ? "收起卡密" : "查看状态"}</button></div>
        {expandedBatch === batch.id && <div className="admin-membership-code-list">{codes.map((code) => <div key={code.id}><span>•••• {code.code_suffix} · {code.tier.toUpperCase()} / {code.duration_days} 天</span><em>{code.status === "available" ? "可用" : code.status === "redeemed" ? `已兑换 ${code.redeemed_at ? new Date(code.redeemed_at).toLocaleDateString("zh-CN") : ""}` : "已停用"}</em>{code.status === "available" && <button type="button" aria-label={`停用卡密末四位 ${code.code_suffix}`} onClick={() => void disableCode(code)} disabled={busy}><X size={14}/></button>}</div>)}</div>}
      </article>)}
      {!batches.length && <p className="moderation-empty">还没有卡密批次。</p>}
    </>}

    {tab === "members" && <>
      <form className="admin-membership-search" onSubmit={(event) => void searchUsers(event)}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按昵称搜索会员用户" minLength={2}/><button type="submit" className="soft-button" disabled={busy}><Search size={15}/>搜索</button></form>
      {users.map((item) => <button type="button" key={item.id} className={`admin-membership-user${selectedUser?.id === item.id ? " selected" : ""}`} onClick={() => { setSelectedUser(item); setManageTier(item.membership_tier || "free"); setManageDays("30"); }}><UserRound size={18}/><span><strong>{item.nickname || "探索者"}</strong><small>{item.membership_tier.toUpperCase()} · {item.membership_expires_at ? `至 ${new Date(item.membership_expires_at).toLocaleDateString("zh-CN")}` : item.membership_tier === "free" ? "当前 Free" : "无到期时间"} · {item.redemptions.length} 次兑换</small></span></button>)}
      {selectedUser && <section className="admin-membership-user-panel"><h3>{selectedUser.nickname || "探索者"} · 会员权益调整</h3><form onSubmit={(event) => void adjustMembership(event)}><div className="admin-membership-fields"><label>会员等级<select value={manageTier} onChange={(event) => setManageTier(event.target.value)}><option value="free">Free（撤销有效会员）</option><option value="plus">Plus</option><option value="pro">Pro</option></select></label>{manageTier !== "free" && <label>有效天数<input type="number" min="1" max="7300" value={manageDays} onChange={(event) => setManageDays(event.target.value)}/></label>}</div><label>操作原因<input required minLength={3} maxLength={500} value={manageReason} onChange={(event) => setManageReason(event.target.value)} placeholder="记录调整或撤销原因"/></label><button className="primary-button" disabled={busy || manageReason.trim().length < 3}>保存并写入审计</button></form>
        <div className="admin-membership-history"><strong>权益与兑换历史</strong>{selectedUser.periods.map((period, index) => <p key={`${period.starts_at}-${index}`}>{period.tier.toUpperCase()} · {new Date(period.starts_at).toLocaleDateString("zh-CN")} – {period.ends_at ? new Date(period.ends_at).toLocaleDateString("zh-CN") : "长期"} · {period.revoked_at ? `已撤销：${period.revoke_reason || "管理员调整"}` : period.source}</p>)}{selectedUser.redemptions.map((item, index) => <p key={`${item.created_at}-${index}`}>卡密兑换 {item.tier.toUpperCase()} · {item.duration_days} 天 · {new Date(item.created_at).toLocaleString("zh-CN")} · 到期 {new Date(item.expires_at).toLocaleDateString("zh-CN")}</p>)}{!selectedUser.periods.length && !selectedUser.redemptions.length && <small>没有会员历史记录。</small>}</div>
      </section>}
      {!users.length && <p className="moderation-empty">搜索昵称以查看会员状态和兑换历史。</p>}
    </>}

    {tab === "orders" && <><div className="admin-membership-note"><ShieldAlert size={17}/><span>爱发电自动订单核验暂未接入。当前采用预生成卡密并由管理员配置平台随机回复；未核验订单不会计入赞助金额，也不会自动发放权益。</span></div>{orders.length ? <div className="admin-membership-orders">{orders.map((order) => <article key={order.id}><strong>{order.provider_order_id}</strong><span>{order.plan_id || "未映射方案"} · {order.amount_cents == null ? "金额未知" : money(order.amount_cents)}</span><small>{order.payment_status} / {order.processing_status} · {new Date(order.received_at).toLocaleString("zh-CN")}</small>{order.issue_note && <p>{order.issue_note}</p>}</article>)}</div> : <p className="moderation-empty">尚无已接收的爱发电订单记录。</p>}</>}

    {tab === "plans" && <div className="admin-membership-plans">{plans.map((plan) => <article key={plan.tier}><div><strong>{plan.display_name}</strong><small>每日额度与赞助方案由数据库服务端配置</small></div><label>翻卡 / 日<input type="number" min="1" max="100" value={plan.daily_flips} onChange={(event) => setPlans((items) => items.map((item) => item.tier === plan.tier ? { ...item, daily_flips: Number(event.target.value) } : item))}/></label><label>支持金额（分）<input type="number" min="0" max="1000000" value={plan.support_price_cents} onChange={(event) => setPlans((items) => items.map((item) => item.tier === plan.tier ? { ...item, support_price_cents: Number(event.target.value) } : item))}/></label>{plan.tier !== "free" && <label>期限（天）<input type="number" min="1" max="7300" value={plan.duration_days || 30} onChange={(event) => setPlans((items) => items.map((item) => item.tier === plan.tier ? { ...item, duration_days: Number(event.target.value) } : item))}/></label>}<button className="soft-button" type="button" onClick={() => void savePlan(plan)} disabled={busy}>保存 {plan.display_name}</button></article>)}</div>}
  </div>;
}
