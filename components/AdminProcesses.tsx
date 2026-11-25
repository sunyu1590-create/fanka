"use client";

/** 服务器进程监控：只读展示宿主机进程/服务级真实 CPU 与内存，不提供任何命令执行。 */

import { useEffect, useMemo, useState } from "react";
import { Server } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { useRealtime } from "@/lib/admin-live";
import { Empty, fmtBytes, fmtNum, fmtPct, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type ProcessRow = { service_key: string; label: string; scope: string; status: string; pid: number | null; process_count: number; cpu_percent: number | null; mem_bytes: number | null; started_at: string | null; captured_at: string };

function uptime(started: string | null) {
  if (!started) return "—";
  const ms = Date.now() - Date.parse(started);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} 分钟`;
  if (hours < 48) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

export default function AdminProcesses() {
  const live = useRealtime();
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [scope, setScope] = useState<string>("");
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [sort, setSort] = useState<"cpu" | "mem" | "name" | "uptime">("cpu");
  const [error, setError] = useState("");

  useEffect(() => {
    if (live.snapshot?.processes?.length) {
      setRows(live.snapshot.processes as ProcessRow[]);
      setCapturedAt(live.snapshot.processes[0]?.captured_at || null);
      return;
    }
    void (async () => {
      try {
        const result = await cloudRequest("/api/v1/admin/processes") as { items: ProcessRow[]; captured_at: string | null; scope: string | null; error: string | null };
        setRows(result.items || []);
        setScope(result.scope || "");
        setCapturedAt(result.captured_at);
        setError(result.error || "");
      } catch (e) { setError(e instanceof Error ? e.message : "进程数据读取失败"); }
    })();
  }, [live.snapshot?.processes]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "cpu") copy.sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));
    else if (sort === "mem") copy.sort((a, b) => (b.mem_bytes || 0) - (a.mem_bytes || 0));
    else if (sort === "name") copy.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
    else copy.sort((a, b) => Date.parse(a.started_at || "2100-01-01") - Date.parse(b.started_at || "2100-01-01"));
    return copy;
  }, [rows, sort]);

  const maxCpu = Math.max(1, ...rows.map((row) => row.cpu_percent || 0));
  const totalCpu = rows.reduce((sum, row) => sum + (row.cpu_percent || 0), 0);
  const totalMem = rows.reduce((sum, row) => sum + (row.mem_bytes || 0), 0);

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={`ab-chip ${rows.length ? "ok" : "warn"}`}><i className="ab-dot" aria-hidden="true" />{rows.length ? "采集正常" : "等待采集"}</span>
        <span className="ab-label">{scope === "host" ? "宿主机视图" : scope === "container" ? "容器内视图（未挂载宿主机 /proc）" : ""} · 最后采集 {fmtTime(capturedAt)}</span>
      </div>
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}

      <div className="ab-card">
        <div className="ab-card__head"><span className="ab-card__title">进程资源</span><span className="ab-card__badge">{rows.length} 个服务</span></div>
        <div className="ab-kv-grid">
          <div><b>{fmtPct(totalCpu)}</b><span>合计 CPU</span></div>
          <div><b>{fmtBytes(totalMem)}</b><span>合计内存（RSS）</span></div>
          <div><b>{fmtNum(rows.reduce((sum, row) => sum + row.process_count, 0))}</b><span>进程数</span></div>
        </div>
        <p className="ab-label" style={{ margin: 0 }}>数据来自宿主机 /proc 的只读采样，每 15 秒一次；高负载服务按 CPU 排序置顶。未采集启动参数，避免泄漏密钥。</p>
      </div>

      <Segmented value={sort} ariaLabel="进程排序" onChange={setSort} options={[{ value: "cpu", label: "按 CPU" }, { value: "mem", label: "按内存" }, { value: "name", label: "按名称" }, { value: "uptime", label: "按运行时间" }]} />

      {sorted.length ? (
        <Group>
          {sorted.map((row) => (
            <div key={row.service_key} className="ab-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`ab-row__icon ${(row.cpu_percent || 0) > 50 ? "tone-coral" : "tone-blue"}`}><Server size={14} /></span>
                <span className="ab-row__body">
                  <span className="ab-row__title">{row.label}</span>
                  <span className="ab-row__meta">PID {row.pid ?? "—"} · {row.process_count} 个进程 · 运行 {uptime(row.started_at)}{row.scope === "container" ? " · 容器视图" : ""}</span>
                </span>
                <span className="ab-row__value" style={{ textAlign: "right" }}>
                  <b style={{ fontSize: 13 }}>{row.cpu_percent == null ? "—" : `${row.cpu_percent.toFixed(1)}%`}</b>
                  <br /><span className="ab-label">{fmtBytes(row.mem_bytes)}</span>
                </span>
              </div>
              <span className={`ab-bar ${(row.cpu_percent || 0) > 50 ? "tone-coral" : "tone-blue"}`}><i style={{ width: `${Math.max(2, Math.round(((row.cpu_percent || 0) / maxCpu) * 100))}%` }} /></span>
            </div>
          ))}
        </Group>
      ) : <Empty icon={<Server size={22} />} title="尚未收到进程采样" hint="监控采集器需要读取宿主机 /proc；没有数据时不显示任何推测值。" />}
    </div>
  );
}
