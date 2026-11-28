"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { privilegedRequest } from "@/lib/reauth-client";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Empty, fmtTime, Group } from "./admin/AdminUIKit";

type Rule = { id: string; scope: string; target: string; action: string; max_concurrent: number | null; rate_per_minute: number | null; bandwidth_kbps: number | null; expires_at: string | null; reason: string; created_at: string; active: boolean };
type AccountRestriction = { id: string; user_id: string; nickname: string; ability: string; until: string | null; reason: string; created_at: string };
type Payload = { rules: Rule[]; accounts: AccountRestriction[]; abilities: string[]; note?: string };

const ABILITY_LABEL: Record<string, string> = {
  login: "登录", browse: "浏览", publish: "发布", comment: "评论", dm: "私信", upload: "上传", download: "下载", ai: "AI 功能",
};

export default function AdminAccess({ view, onNotice }: { view: "ip-rules" | "account-limits"; onNotice: (text: string) => void }) {
  return view === "ip-rules" ? <RulePanel onNotice={onNotice} /> : <AccountPanel onNotice={onNotice} />;
}

function RulePanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState("all");
  const [action, setAction] = useState("block");
  const [duration, setDuration] = useState("24h");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/access/rules");
      if (result) { setData(result as Payload); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "访问规则读取失败");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (busy) return;
    if (!target.trim()) { onNotice("请输入 IP 或网段"); return; }
    if (reason.trim().length < 4) { onNotice("请填写至少 4 个字的操作原因"); return; }
    const permanent = duration === "permanent";
    const hours = duration === "1h" ? 1 : duration === "24h" ? 24 : duration === "7d" ? 168 : duration === "30d" ? 720 : 0;
    const expiresAt = permanent ? null : new Date(Date.now() + hours * 3_600_000).toISOString();
    const ok = await confirmInApp(
      `${target} 将在「${scope === "all" ? "全站" : scope}」范围被${action === "block" ? "封禁" : "限流"}。管理后台入口不受影响。`,
      { title: permanent ? "确认永久封禁" : "确认添加限制", confirmLabel: permanent ? "永久封禁" : "确认", danger: true },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await privilegedRequest("/api/v1/admin/access/rules", {
        kind: "rule", target: target.trim(), scope, action, permanent, expiresAt, reason,
        ratePerMinute: action === "limit" ? 120 : undefined,
      });
      onNotice("规则已生效");
      setTarget(""); setReason("");
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "规则写入失败");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (rule: Rule) => {
    const ok = await confirmInApp(`确认解除 ${rule.target} 的限制？`, { title: "解除限制", confirmLabel: "解除", danger: true });
    if (!ok) return;
    try {
      await privilegedRequest(`/api/v1/admin/access/rules?kind=rule&id=${rule.id}`, undefined, "DELETE");
      onNotice("已解除");
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "解除失败");
    }
  };

  return (
    <div className="cc-stack">
      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}>
          <span className="ab-card__title">新增 IP 规则</span>
          <span className="ab-card__badge">应用层立即生效</span>
        </div>
        <div className="cc-form">
          <label>IP / 网段<input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="例如 203.0.113.7 或 203.0.113.0/24" /></label>
          <div className="cc-actions">
            <label style={{ flex: 1 }}>范围
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="all">全站</option><option value="web">网页访问</option><option value="api">API</option>
                <option value="upload">上传</option><option value="download">下载</option><option value="auth">登录</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>处理
              <select value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="block">封禁</option><option value="limit">限流</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>时长
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="1h">1 小时</option><option value="24h">24 小时</option><option value="7d">7 天</option>
                <option value="30d">30 天</option><option value="permanent">永久</option>
              </select>
            </label>
          </div>
          <label>操作原因（写入审计）<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：持续异常扫描、批量注册" /></label>
          <div className="cc-actions">
            <button type="button" className="cc-btn primary" disabled={busy} onClick={() => void submit()}><ShieldAlert size={14} />{busy ? "写入中…" : "添加规则"}</button>
            <span className="cc-note" style={{ margin: 0 }}>管理接口不受 IP 规则影响，避免管理员自锁。</span>
          </div>
        </div>
      </Group>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">当前规则</span><span className="ab-card__badge">{data?.rules.filter((rule) => rule.active).length || 0} 条</span></div>
        {error ? <Empty title="规则不可用" hint={error} /> : !data ? <Empty title="正在读取规则" /> : !data.rules.length ? <Empty title="暂无访问规则" hint="异常访问优先限流，不直接永久封禁" /> : (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>目标</th><th>范围</th><th>处理</th><th>到期</th><th>原因</th><th>创建</th><th /></tr></thead>
              <tbody>
                {data.rules.map((rule) => (
                  <tr key={rule.id} style={{ opacity: rule.active ? 1 : .45 }}>
                    <td className="cc-mono">{rule.target}</td>
                    <td>{rule.scope === "all" ? "全站" : rule.scope}</td>
                    <td><span className={`cc-state ${rule.action === "block" ? "warn" : "ok"}`}>{rule.action === "block" ? "封禁" : "限流"}</span></td>
                    <td>{rule.expires_at ? fmtTime(rule.expires_at) : "永久"}</td>
                    <td>{rule.reason || "—"}</td>
                    <td>{fmtTime(rule.created_at)}</td>
                    <td>{rule.active ? <button type="button" className="cc-btn" onClick={() => void revoke(rule)}><Trash2 size={13} />解除</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cc-note">{data?.note || "IP 规则与账号能力互相独立；共享出口不会被整段封禁。"}</p>
      </Group>
    </div>
  );
}

function AccountPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [userId, setUserId] = useState("");
  const [ability, setAbility] = useState("publish");
  const [duration, setDuration] = useState("7d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await cloudRequest("/api/v1/admin/access/rules");
    if (result) setData(result as Payload);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!/^[0-9a-f-]{36}$/i.test(userId.trim())) { onNotice("请输入有效的账号 ID（UUID）"); return; }
    if (reason.trim().length < 4) { onNotice("请填写至少 4 个字的原因"); return; }
    const permanent = duration === "permanent";
    const hours = duration === "24h" ? 24 : duration === "7d" ? 168 : duration === "30d" ? 720 : 0;
    const until = permanent ? null : new Date(Date.now() + hours * 3_600_000).toISOString();
    const ok = await confirmInApp(
      `该账号的「${ABILITY_LABEL[ability] || ability}」将被限制，其他能力不受影响。`,
      { title: "确认限制账号能力", confirmLabel: "确认限制", danger: true },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await privilegedRequest("/api/v1/admin/access/rules", { kind: "account", userId: userId.trim(), ability, until, permanent, reason });
      onNotice("账号限制已生效");
      setReason(""); setUserId("");
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "账号限制失败");
    } finally {
      setBusy(false);
    }
  };

  const release = async (row: AccountRestriction) => {
    const ok = await confirmInApp(`恢复 ${row.nickname} 的「${ABILITY_LABEL[row.ability] || row.ability}」？`, { title: "解除限制", confirmLabel: "解除" });
    if (!ok) return;
    await privilegedRequest(`/api/v1/admin/access/rules?kind=account&id=${row.id}`, undefined, "DELETE");
    onNotice("已解除");
    await load();
  };

  return (
    <div className="cc-stack">
      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}><span className="ab-card__title">限制账号能力</span><span className="ab-card__badge">不封禁共享 IP</span></div>
        <div className="cc-form">
          <label>账号 ID<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="profiles.id（UUID）" /></label>
          <div className="cc-actions">
            <label style={{ flex: 1 }}>能力
              <select value={ability} onChange={(event) => setAbility(event.target.value)}>
                {Object.entries(ABILITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>时长
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="24h">24 小时</option><option value="7d">7 天</option><option value="30d">30 天</option><option value="permanent">永久</option>
              </select>
            </label>
          </div>
          <label>原因<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="写入审计记录" /></label>
          <button type="button" className="cc-btn danger" disabled={busy} onClick={() => void submit()}>{busy ? "写入中…" : "限制该能力"}</button>
        </div>
      </Group>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">生效中的账号限制</span></div>
        {!data?.accounts.length ? <Empty title="暂无账号限制" /> : (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>账号</th><th>能力</th><th>截止</th><th>原因</th><th>创建</th><th /></tr></thead>
              <tbody>
                {data.accounts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nickname}<small> {row.user_id.slice(0, 8)}</small></td>
                    <td>{ABILITY_LABEL[row.ability] || row.ability}</td>
                    <td>{row.until ? fmtTime(row.until) : "永久"}</td>
                    <td>{row.reason}</td>
                    <td>{fmtTime(row.created_at)}</td>
                    <td><button type="button" className="cc-btn" onClick={() => void release(row)}>解除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Group>
    </div>
  );
}
