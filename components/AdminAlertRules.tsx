"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Empty, Group, Segmented } from "./admin/AdminUIKit";

type Metric = { key: string; label: string; unit: string; hint: string };
type Rule = {
  id: string; metric: string; operator: string; threshold: number; duration_seconds: number;
  cooldown_seconds: number; level: string; enabled: boolean; label: string; unit: string;
  firing: { level: string; last_seen_at: string; occurrences: number } | null;
};
type Payload = { metrics: Metric[]; rules: Rule[]; sample: Record<string, number | null> | null; note: string };

const EMPTY = { metric: "cpu_percent", operator: ">", threshold: 85, duration_seconds: 180, cooldown_seconds: 1800, level: "warn", enabled: true };

/** 告警规则：阈值、持续时间、冷却时间全部可配，采集器按表执行。 */
export default function AdminAlertRules() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/alerts/rules") as Payload;
      setData(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "规则读取失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await cloudRequest("/api/v1/admin/alerts/rules", editing ? { ...draft, id: editing } : draft);
      setEditing(null);
      setDraft({ ...EMPTY });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally { setBusy(false); }
  };

  const remove = async (rule: Rule) => {
    const ok = await confirmInApp(`删除「${rule.label} ${rule.operator} ${rule.threshold}${rule.unit}」这条告警规则？删除后不再按此阈值告警。`, { title: "删除告警规则", confirmLabel: "删除", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await cloudRequest(`/api/v1/admin/alerts/rules?id=${rule.id}`, undefined, "DELETE");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
    } finally { setBusy(false); }
  };

  const toggle = async (rule: Rule) => {
    setBusy(true);
    try {
      await cloudRequest("/api/v1/admin/alerts/rules", {
        id: rule.id, metric: rule.metric, operator: rule.operator, threshold: rule.threshold,
        duration_seconds: rule.duration_seconds, cooldown_seconds: rule.cooldown_seconds,
        level: rule.level, enabled: !rule.enabled,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally { setBusy(false); }
  };

  if (loading) return <Group><Empty title="正在读取告警规则" /></Group>;
  if (error && !data) return <Group><Empty title="规则不可用" hint={error} /></Group>;
  if (!data) return null;

  const metric = data.metrics.find((item) => item.key === draft.metric);

  return (
    <div className="cc-stack">
      {error ? <div className="cc-notice warn">{error}</div> : null}

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}>
          <span className="ab-card__title">阈值规则</span>
          <span className="ab-card__badge">{data.rules.length} 条 · 当前采样 {data.sample?.captured_at ? new Date(data.sample.captured_at).toLocaleTimeString("zh-CN") : "—"}</span>
        </div>
        <div className="cc-tablewrap">
          <table className="cc-table">
            <thead><tr><th>指标</th><th>条件</th><th>持续时间</th><th>冷却</th><th>级别</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.label}<small> · {rule.metric}</small></td>
                  <td className="cc-mono">{rule.operator} {rule.threshold}{rule.unit}</td>
                  <td>{rule.duration_seconds}s</td>
                  <td>{Math.round(rule.cooldown_seconds / 60)} 分钟</td>
                  <td><span className={`cc-state ${rule.level === "critical" ? "warn" : ""}`}>{rule.level}</span></td>
                  <td>{rule.firing ? <span className="cc-state warn">触发中 ×{rule.firing.occurrences}</span> : rule.enabled ? <span className="cc-state ok">监听中</span> : <span className="cc-state">已停用</span>}</td>
                  <td>
                    <button type="button" className="cc-btn" onClick={() => { setEditing(rule.id); setDraft({ metric: rule.metric, operator: rule.operator, threshold: rule.threshold, duration_seconds: rule.duration_seconds, cooldown_seconds: rule.cooldown_seconds, level: rule.level, enabled: rule.enabled }); }}>编辑</button>
                    <button type="button" className="cc-btn" disabled={busy} onClick={() => void toggle(rule)}>{rule.enabled ? "停用" : "启用"}</button>
                    <button type="button" className="cc-btn" disabled={busy} onClick={() => void remove(rule)} aria-label="删除规则"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.rules.length ? <p className="cc-muted" style={{ padding: 16 }}>还没有告警规则，先新增一条</p> : null}
        </div>
        <p className="cc-note">{data.note}</p>
      </Group>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}>
          <span className="ab-card__title">{editing ? "编辑规则" : "新增规则"}</span>
          {editing ? <button type="button" className="cc-btn" onClick={() => { setEditing(null); setDraft({ ...EMPTY }); }}>取消编辑</button> : null}
        </div>
        <div className="cc-form">
          <label>
            <span>监控指标</span>
            <select value={draft.metric} onChange={(event) => setDraft({ ...draft, metric: event.target.value })}>
              {data.metrics.map((item) => <option key={item.key} value={item.key}>{item.label}（{item.key}）</option>)}
            </select>
          </label>
          <label>
            <span>比较方式</span>
            <Segmented value={draft.operator} onChange={(value) => setDraft({ ...draft, operator: value })} options={[{ value: ">", label: ">" }, { value: ">=", label: "≥" }, { value: "<", label: "<" }, { value: "<=", label: "≤" }]} ariaLabel="比较方式" />
          </label>
          <label>
            <span>阈值 {metric ? `(${metric.unit || "布尔"})` : ""}</span>
            <input type="number" step="0.1" value={draft.threshold} onChange={(event) => setDraft({ ...draft, threshold: Number(event.target.value) })} />
          </label>
          <label>
            <span>持续时间（秒）</span>
            <input type="number" min={0} max={86400} value={draft.duration_seconds} onChange={(event) => setDraft({ ...draft, duration_seconds: Number(event.target.value) })} />
          </label>
          <label>
            <span>冷却时间（秒）</span>
            <input type="number" min={0} max={604800} value={draft.cooldown_seconds} onChange={(event) => setDraft({ ...draft, cooldown_seconds: Number(event.target.value) })} />
          </label>
          <label>
            <span>级别</span>
            <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}>
              <option value="info">提示</option>
              <option value="warn">警告</option>
              <option value="critical">严重</option>
            </select>
          </label>
          <div className="cc-form__actions">
            <button type="button" className="cc-btn primary" disabled={busy} onClick={() => void save()}>
              {editing ? <Check size={14} /> : <Plus size={14} />}{editing ? "保存修改" : "新增规则"}
            </button>
            {metric ? <small className="cc-muted">{metric.hint}</small> : null}
          </div>
        </div>
      </Group>
    </div>
  );
}
