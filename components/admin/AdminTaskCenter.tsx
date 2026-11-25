"use client";

/** 统一任务控制台：聚合媒体、AI 审核/总结/分类、资源扫描与发布任务。 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { useRealtime } from "@/lib/admin-live";
import { Collapse, Empty, fmtBytes, fmtNum, fmtTime, Group, Segmented } from "./AdminUIKit";

type TaskRow = {
  id: string; group: string; title: string; status: string; stage: string;
  progress: number | null; processed: number | null; total: number | null;
  error: string | null; created_at: string; updated_at: string; link: string | null; meta: string | null;
};
type Payload = { updated_at: string; counts: { running: number; queued: number; failed: number; paused: number; total: number }; groups: Array<{ key: string; label: string; count: number; items: TaskRow[] }> };

const STATUS_LABEL: Record<string, string> = { running: "运行中", uploading: "上传中", queued: "排队", created: "已创建", verifying: "校验中", preparing: "准备中", compressing: "压缩中", retrying: "重试中", paused: "已暂停", failed: "失败", completed: "已完成", ready: "完成", processing: "处理中" };

export default function AdminTaskCenter({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const live = useRealtime();
  const [data, setData] = useState<Payload | null>(null);
  const [history, setHistory] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"active" | "history">("active");
  const last = useRef(0);

  const load = useCallback(async (mode: "active" | "history") => {
    try {
      const result = await cloudRequest(`/api/v1/admin/tasks${mode === "history" ? "?history=1" : ""}`) as Payload;
      if (mode === "history") setHistory(result); else setData(result);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "任务数据读取失败"); }
  }, []);

  useEffect(() => { void load("active"); }, [load]);
  useEffect(() => { if (view === "history" && !history) void load("history"); }, [view, history, load]);
  // 只跟随统一实时快照的版本变化刷新，且最多 3 秒一次，避免每秒重复查询任务表。
  useEffect(() => {
    if (!live.snapshot?.revision) return;
    if (Date.now() - last.current < 3000) return;
    last.current = Date.now();
    void load(view === "history" ? "history" : "active");
  }, [live.snapshot?.revision, view, load]);

  const payload = view === "history" ? history : data;

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <Segmented value={view} ariaLabel="任务视图" onChange={setView} options={[{ value: "active", label: "进行中" }, { value: "history", label: "历史" }]} />
      <div className="ab-bento">
        {[
          ["运行中", data?.counts.running ?? 0, "emerald"],
          ["等待中", data?.counts.queued ?? 0, "amber"],
          ["异常", data?.counts.failed ?? 0, "coral"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className={`ab-card ab-card--tight ab-c2 ab-m4 tone-${tone}`} style={{ gap: 2 }}>
            <span className="ab-label">{label}</span>
            <b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: tone === "coral" && Number(value) > 0 ? "var(--ab-coral)" : undefined }}>{fmtNum(Number(value))}</b>
          </div>
        ))}
      </div>
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      {!payload ? <div className="ab-skel" style={{ height: 180, borderRadius: 18 }} /> : null}
      {payload?.groups.map((group) => (
        <Collapse
          key={group.key}
          title={group.label}
          count={group.count}
          defaultOpen={view === "active" && group.count > 0}
          tone={group.key === "media" ? "emerald" : group.key === "scan" ? "blue" : "violet"}
        >
          {group.items.length ? (
            <Group plain>
              {group.items.map((task) => (
                <div key={task.id} className="ab-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="ab-row__body">
                      <span className="ab-row__title" style={{ fontSize: 12 }}>{task.title}</span>
                      <span className="ab-row__meta">
                        {STATUS_LABEL[task.status] || task.status} · {task.stage}
                        {task.total != null ? ` · ${fmtNum(task.processed)}/${fmtNum(task.total)}` : task.processed ? ` · 已处理 ${fmtNum(task.processed)}` : ""}
                        {task.meta ? ` · ${task.meta}` : ""}
                      </span>
                    </span>
                    <span className={`ab-chip ${task.status === "failed" ? "bad" : ["running", "uploading", "verifying", "retrying"].includes(task.status) ? "info" : "ok"}`}>{STATUS_LABEL[task.status] || task.status}</span>
                    {task.link ? <button type="button" className="ab-iconbtn" aria-label="查看来源" onClick={() => onNavigate?.(task.link as string)}><ChevronRight size={15} /></button> : null}
                  </div>
                  {task.progress != null ? <div className="ab-progress"><i style={{ width: `${Math.min(100, task.progress)}%` }} /></div> : null}
                  {task.error ? <span className="ab-label" style={{ color: "var(--ab-coral)" }}>{task.error}</span> : null}
                </div>
              ))}
            </Group>
          ) : <Empty title="这一组当前没有任务" />}
        </Collapse>
      ))}
      <p className="ab-label" style={{ margin: 0 }}>任务来自现有业务表，没有确定总量的任务只显示真实状态与已处理数量，不推算百分比。{payload?.updated_at ? `读取于 ${fmtTime(payload.updated_at)}。` : ""}</p>
    </div>
  );
}
