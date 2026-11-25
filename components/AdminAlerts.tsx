"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellOff, Check, ChevronDown } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Collapse, Empty, fmtNum, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type Alert = {
  id: string; alert_type: string; level: string; title: string; detail: string; metric_snapshot: Record<string, unknown> | null;
  status: string; first_seen_at: string; last_seen_at: string; resolved_at: string | null; occurrences: number; handle_note: string | null;
};

const STATUS_LABEL: Record<string, string> = { open: "待处理", acknowledged: "已确认", resolving: "处理中", ignored: "已忽略", resolved: "已恢复" };
const TYPE_LABEL: Record<string, string> = {
  cpu_high: "CPU 偏高", mem_low: "内存不足", disk_high: "磁盘容量", api_errors: "API 错误", upload_first_fail: "上传失败", service_down: "服务不可用",
  "rule:cpu_percent": "CPU 使用率", "rule:mem_percent": "内存使用率", "rule:disk_percent": "磁盘使用率",
  "rule:tcp_total": "TCP 连接总数", "rule:api_error_rate": "API 错误率", "rule:api_p95_ms": "API P95 耗时",
  "rule:upload_fail_rate": "上传失败率", "rule:net_tx_rate": "出网速率", "rule:cert_days_left": "HTTPS 证书剩余",
  "rule:service_down": "服务健康检查",
};

export default function AdminAlerts({ refreshKey = 0 }: { refreshKey?: number }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"active" | "all" | "resolved">("active");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // 历史告警默认折叠、展开后分页，避免 80 多条一次铺开。
  const [limit, setLimit] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cloudRequest("/api/v1/admin/alerts?status=all") as { alerts: Alert[] };
      setAlerts(result.alerts || []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "告警读取失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const filtered = useMemo(() => alerts.filter((alert) => {
    if (filter === "active") return alert.status !== "resolved";
    if (filter === "resolved") return alert.status === "resolved";
    return true;
  }), [alerts, filter]);

  const act = async (alert: Alert, action: "acknowledge" | "start" | "resolve" | "ignore" | "reopen") => {
    setBusy(alert.id);
    try {
      await cloudRequest("/api/v1/admin/alerts", { id: alert.id, action, note: action === "resolve" ? "管理员确认恢复" : undefined }, "PATCH");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const activeCount = alerts.filter((alert) => alert.status !== "resolved").length;

  const renderAlert = (alert: Alert) => (
    <div key={alert.id} className="ab-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`ab-row__icon ${alert.level === "critical" ? "tone-coral" : "tone-amber"}`}><BellOff size={14} /></span>
        <span className="ab-row__body">
          <span className="ab-row__title">{alert.title}</span>
          <span className="ab-row__meta">{TYPE_LABEL[alert.alert_type] || alert.alert_type} · {fmtTime(alert.first_seen_at)} 起 · 出现 {alert.occurrences} 次</span>
        </span>
        <span className={`ab-chip ${alert.status === "resolved" ? "ok" : alert.level === "critical" ? "bad" : "warn"}`}>{STATUS_LABEL[alert.status] || alert.status}</span>
        {alert.status !== "resolved" ? (
          <span style={{ display: "flex", gap: 5 }}>
            {alert.status === "open" ? <button type="button" className="ab-chip info" style={{ border: 0 }} disabled={busy === alert.id} onClick={() => void act(alert, "acknowledge")}>确认</button> : null}
            <button type="button" className="ab-chip ok" style={{ border: 0 }} disabled={busy === alert.id} onClick={() => void act(alert, "resolve")}><Check size={11} />恢复</button>
            {alert.status !== "ignored" ? <button type="button" className="ab-chip" style={{ border: 0 }} disabled={busy === alert.id} onClick={() => void act(alert, "ignore")}>忽略</button> : <button type="button" className="ab-chip" style={{ border: 0 }} disabled={busy === alert.id} onClick={() => void act(alert, "reopen")}>重新打开</button>}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--ab-ink-3)", flex: 1 }}>{alert.detail}{alert.resolved_at ? ` · ${fmtTime(alert.resolved_at)} 恢复` : ""}</span>
        {alert.metric_snapshot ? (
          <button type="button" className="ab-label" style={{ border: 0, background: "none", color: "var(--ab-ink-3)", display: "inline-flex", alignItems: "center", gap: 2 }} onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
            指标快照<ChevronDown size={12} style={{ transform: expanded === alert.id ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
          </button>
        ) : null}
      </div>
      {expanded === alert.id && alert.metric_snapshot ? (
        <pre style={{ margin: 0, fontSize: 10, lineHeight: 1.6, color: "var(--ab-ink-3)", background: "var(--ab-fill)", borderRadius: 10, padding: 10, overflow: "auto", maxHeight: 180 }}>
          {JSON.stringify(alert.metric_snapshot, null, 2)}
        </pre>
      ) : null}
    </div>
  );

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ab-bento">
        <div className="ab-card ab-card--tight ab-c2 ab-m6">
          <span className="ab-label">当前告警</span>
          <b style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: activeCount ? "var(--ab-coral)" : "var(--ab-emerald)" }}>{fmtNum(activeCount)}</b>
        </div>
        <div className="ab-card ab-card--tight ab-c2 ab-m6">
          <span className="ab-label">历史累计</span>
          <b style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNum(alerts.length)}</b>
        </div>
      </div>
      <Segmented
        value={filter}
        ariaLabel="告警筛选"
        onChange={(next: "active" | "all" | "resolved") => { setFilter(next); setLimit(20); }}
        options={[
          { value: "active", label: "当前", count: activeCount },
          { value: "all", label: "全部", count: alerts.length },
          { value: "resolved", label: "已恢复" },
        ]}
      />
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      {filter === "active" ? (
        <Group>
          {loading ? <div className="ab-skel" style={{ height: 180, margin: 12 }} /> : filtered.length ? filtered.map(renderAlert) : <Empty title="当前没有未恢复告警" hint="告警恢复后会自动关闭并保留历史。" />}
        </Group>
      ) : (
        <Collapse
          title={filter === "resolved" ? "已恢复告警" : "全部告警"}
          count={filtered.length}
          hint="历史默认折叠，展开后按 20 条分页加载"
        >
          <Group plain>
            {filtered.slice(0, limit).map(renderAlert)}
            {filtered.length > limit ? (
              <button type="button" className="ab-row" style={{ justifyContent: "center" }} onClick={() => setLimit((value) => value + 20)}>
                <span className="ab-row__body" style={{ alignItems: "center" }}><span className="ab-row__title" style={{ fontSize: 12 }}>加载更多（已显示 {Math.min(limit, filtered.length)} / {filtered.length}）</span></span>
              </button>
            ) : null}
            {!filtered.length ? <Empty title="暂无告警记录" /> : null}
          </Group>
        </Collapse>
      )}
    </div>
  );
}
