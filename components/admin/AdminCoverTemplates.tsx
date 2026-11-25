"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Play, Plus, RefreshCw, Square, Star, Trash2, Wand2 } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { userMessage } from "@/lib/user-message";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Collapse, Empty, Group, fmtNum } from "./AdminUIKit";

/**
 * 合集封面管理：官方模板目录 + 历史封面补齐。
 * 模板改动即时生效，客户端不内置模板清单，因此不需要重新发版。
 */

type Template = {
  id: string; name: string; category: string; renderType: string;
  palette: Record<string, string> | null; params: Record<string, unknown> | null;
  editable: Record<string, boolean> | null; version: number; sortOrder: number;
  enabled: boolean; isDefault: boolean; previewPath: string | null;
};

type Coverage = {
  total: number; with_cover: number; with_record: number; missing: number;
  by_source: Record<string, number>;
};

type Job = {
  id: string; status: string; total: number; processed: number; succeeded: number;
  failed: number; skipped: number; cursor: string | null; error: string | null;
  created_at: string; updated_at: string; started_at: string | null; finished_at: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  swiss: "瑞士编辑", glass: "光学玻璃", magazine: "沉浸杂志",
  minimal: "极简文字", literary: "文学艺术", creative: "创作实践",
};

const SOURCE_LABEL: Record<string, string> = {
  auto: "自动生成", template: "官方预设", upload: "自定义上传", post: "作品图片", none: "未设置",
};

const JOB_LABEL: Record<string, string> = {
  queued: "排队中", running: "进行中", paused: "已暂停", done: "已完成", failed: "已失败",
};

export default function AdminCoverTemplates({ refreshKey = 0 }: { refreshKey?: number }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cloudRequest("/api/v1/admin/cover-templates") as { templates: Template[]; coverage: Coverage | null; jobs: Job[] };
      setTemplates(result?.templates || []);
      setCoverage(result?.coverage || null);
      setJobs((result?.jobs || []) as Job[]);
      setError("");
    } catch (err) {
      setError(userMessage(err, "模板读取失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await cloudRequest(`/api/v1/admin/cover-templates/${id}`, body, "PATCH");
      await load();
    } catch (err) {
      setError(userMessage(err, "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (template: Template) => {
    if (!(await confirmInApp(`停用「${template.name}」后，新封面不再推荐该模板；已经用该模板生成的封面保持原样，不会失效。`, { title: "停用模板", confirmLabel: "停用", danger: true }))) return;
    setBusy(true);
    try {
      await cloudRequest(`/api/v1/admin/cover-templates/${template.id}`, undefined, "DELETE");
      await load();
    } catch (err) {
      setError(userMessage(err, "停用失败"));
    } finally {
      setBusy(false);
    }
  };

  const runBackfill = async (action: "start" | "step" | "resume" | "retry" | "pause", jobId?: string) => {
    setRunning(true);
    setError("");
    try {
      const result = await cloudRequest("/api/v1/admin/cover-backfill", { action, job_id: jobId, limit: 6 }) as { job: Job };
      const job = result?.job;
      if (job) {
        setNotice(`已处理 ${job.processed}/${job.total} · 成功 ${job.succeeded} · 跳过 ${job.skipped} · 失败 ${job.failed}`);
        if (job.status === "running") {
          // 自动续跑下一批：每批之间让出主线程，避免长时间占用。
          window.setTimeout(() => { void runBackfill("step", job.id); }, 600);
        } else {
          setNotice(job.status === "done" ? `补齐完成：成功 ${job.succeeded}，跳过 ${job.skipped}，失败 ${job.failed}` : `任务${JOB_LABEL[job.status] || job.status}`);
        }
      }
      await load();
    } catch (err) {
      setError(userMessage(err, "补齐任务执行失败"));
    } finally {
      setRunning(false);
    }
  };

  const activeJob = jobs.find((job) => job.status === "running" || job.status === "paused" || job.status === "queued") || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
      {error ? <p className="moderation-feedback error animated-notice" role="alert">{error}</p> : null}
      {notice ? <p className="moderation-feedback animated-notice" role="status">{notice}</p> : null}

      <Group>
        <div className="ab-row" style={{ alignItems: "center" }}>
          <span className="ab-row__body">
            <span className="ab-row__title">合集封面覆盖率</span>
            <span className="ab-row__meta">
              共 {fmtNum(coverage?.total)} 个合集 · 已有封面 {fmtNum(coverage?.with_cover)} · 待补齐 {fmtNum(coverage?.missing)}
            </span>
          </span>
          <button type="button" className="ab-chip-btn" disabled={loading} onClick={() => void load()}><RefreshCw size={13} /> 刷新</button>
        </div>
        {coverage ? (
          <div style={{ padding: "0 14px 12px" }}>
            <div className="ab-progress"><i style={{ width: `${coverage.total ? Math.round((coverage.with_cover / coverage.total) * 100) : 0}%` }} /></div>
            <div className="ab-source-chips">
              {Object.entries(coverage.by_source || {}).map(([source, count]) => (
                <span key={source} className="ab-chip">{SOURCE_LABEL[source] || source} {count}</span>
              ))}
            </div>
          </div>
        ) : null}
      </Group>

      <Collapse title="官方模板" count={templates.length} hint="启用、排序与配色即时生效">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ab-chip-btn is-active" onClick={() => { setCreating(true); setEditing(null); }}><Plus size={13} /> 新增模板</button>
            {activeJob ? (
              <>
                <span className="ab-chip">补齐任务 {activeJob.processed}/{activeJob.total}</span>
                {activeJob.status === "paused"
                  ? <button type="button" className="ab-chip-btn" disabled={running} onClick={() => void runBackfill("resume", activeJob.id)}><Play size={12} /> 继续</button>
                  : <button type="button" className="ab-chip-btn" disabled={running}
                      onClick={async () => { const result = await cloudRequest("/api/v1/admin/cover-backfill", { action: "pause", job_id: activeJob.id }) as { job: Job }; setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]); }}><Square size={12} /> 暂停</button>}
                <button type="button" className="ab-chip-btn" disabled={running} onClick={() => void runBackfill("retry", activeJob.id)}><RefreshCw size={12} /> 重试</button>
              </>
            ) : (
              <button type="button" className="ab-chip-btn is-active" disabled={running} onClick={() => void runBackfill("start")}>
                {running ? <Loader2 size={12} className="ab-spin" /> : <Wand2 size={12} />} {running ? "补齐中…" : "补齐历史封面"}
              </button>
            )}
          </div>

          {creating || editing ? (
            <TemplateForm
              initial={editing}
              busy={busy}
              onCancel={() => { setCreating(false); setEditing(null); }}
              onSubmit={async (body) => {
                setBusy(true);
                try {
                  if (editing) await cloudRequest(`/api/v1/admin/cover-templates/${editing.id}`, body, "PATCH");
                  else await cloudRequest("/api/v1/admin/cover-templates", body, "POST");
                  setCreating(false);
                  setEditing(null);
                  setNotice(editing ? "模板已更新" : "模板已创建");
                  await load();
                } catch (err) {
                  setError(userMessage(err, "保存失败"));
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}

          {templates.length ? (
            <div className="ab-table">
              <div className="ab-table-head"><span>模板</span><span>分类</span><span>排序</span><span>默认</span><span>状态</span><span>操作</span></div>
              {templates.map((template) => (
                <div className="ab-table-row" key={template.id}>
                  <span title={template.name}>{template.name}</span>
                  <span>{CATEGORY_LABEL[template.category] || template.category}</span>
                  <span>{template.sortOrder}</span>
                  <span>{template.isDefault ? <Star size={12} fill="currentColor" /> : "—"}</span>
                  <span>{template.enabled ? "启用" : "停用"}</span>
                  <span className="ab-table-actions">
                    <button type="button" className="ab-iconbtn" aria-label="上移" disabled={busy}
                      onClick={() => void patch(template.id, { sort_order: Math.max(0, template.sortOrder - 10) })}><ArrowUp size={13} /></button>
                    <button type="button" className="ab-iconbtn" aria-label="下移" disabled={busy}
                      onClick={() => void patch(template.id, { sort_order: template.sortOrder + 10 })}><ArrowDown size={13} /></button>
                    <button type="button" className="ab-chip-btn" disabled={busy} onClick={() => setEditing(template)}>编辑</button>
                    <button type="button" className="ab-chip-btn" disabled={busy || template.isDefault}
                      onClick={() => void patch(template.id, { is_default: true })}>设为默认</button>
                    <button type="button" className="ab-chip-btn" disabled={busy}
                      onClick={() => void patch(template.id, { enabled: !template.enabled })}>{template.enabled ? "停用" : "启用"}</button>
                    <button type="button" className="ab-iconbtn danger" aria-label="删除" disabled={busy} onClick={() => void disable(template)}><Trash2 size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty title="还没有可用模板" hint="至少保留一个模板才能为无封面合集生成封面" />}
        </div>
      </Collapse>

      <Collapse title="补齐记录" count={jobs.length} hint="历史任务默认折叠">
        {jobs.length ? (
          <div className="ab-table">
            <div className="ab-table-head"><span>开始时间</span><span>状态</span><span>进度</span><span>成功</span><span>跳过</span><span>失败</span></div>
            {jobs.map((job) => (
              <div className="ab-table-row" key={job.id}>
                <span>{new Date(job.created_at).toLocaleString("zh-CN")}</span>
                <span>{JOB_LABEL[job.status] || job.status}</span>
                <span>{job.processed}/{job.total}</span>
                <span>{job.succeeded}</span>
                <span>{job.skipped}</span>
                <span>{job.failed}</span>
              </div>
            ))}
          </div>
        ) : <Empty title="还没有执行过补齐任务" />}
      </Collapse>
    </div>
  );
}

function TemplateForm({
  initial, busy, onSubmit, onCancel,
}: {
  initial: Template | null;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [id, setId] = useState(initial?.id || "");
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "swiss");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 500);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [colors, setColors] = useState({
    bg: initial?.palette?.bg || "#F4F1EA",
    ink: initial?.palette?.ink || "#141414",
    accent: initial?.palette?.accent || "#1F4EF5",
    muted: initial?.palette?.muted || "#8A8578",
  });
  const [layout, setLayout] = useState(String(initial?.params?.layout || initial?.params?.shape || ""));

  return (
    <div className="ab-banner-editor">
      <div className="ab-banner-editor-head"><strong>{initial ? "编辑模板" : "新增模板"}</strong>
        <button type="button" className="ab-chip-btn" onClick={onCancel}>取消</button>
      </div>
      <div className="ab-kv-grid">
        <label className="ab-field">
          <span>模板编号（小写字母/数字/连字符）</span>
          <input value={id} disabled={Boolean(initial)} maxLength={40} onChange={(event) => setId(event.target.value.toLowerCase())} placeholder="swiss-07" />
        </label>
        <label className="ab-field">
          <span>模板名称</span>
          <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="瑞士编辑 · 新变体" />
        </label>
        <label className="ab-field">
          <span>分类</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="ab-field">
          <span>排序权重</span>
          <input type="number" min={0} max={9999} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} />
        </label>
        <label className="ab-field">
          <span>版式参数（layout / shape）</span>
          <input value={layout} onChange={(event) => setLayout(event.target.value)} placeholder="stack / grid / index / prism" />
        </label>
        <label className="ab-field">
          <span>启用</span>
          <button type="button" className={`ab-switch${enabled ? " is-on" : ""}`} aria-pressed={enabled} onClick={() => setEnabled((value) => !value)}><i /></button>
        </label>
      </div>
      <div className="ab-color-grid">
        {(["bg", "ink", "accent", "muted"] as const).map((key) => (
          <label key={key} className="ab-field">
            <span>{key === "bg" ? "底色" : key === "ink" ? "文字" : key === "accent" ? "强调" : "辅助"}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={colors[key]} onChange={(event) => setColors({ ...colors, [key]: event.target.value })} />
              <input value={colors[key]} maxLength={7} onChange={(event) => setColors({ ...colors, [key]: event.target.value })} />
            </div>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="ab-primary-btn"
        disabled={busy || name.trim().length < 2 || (!initial && !/^[a-z0-9][a-z0-9-]{1,40}$/.test(id))}
        onClick={() => void onSubmit({
          ...(initial ? {} : { id }),
          name: name.trim(),
          category,
          render_type: category,
          sort_order: sortOrder,
          enabled,
          palette: colors,
          params: layout ? { ...(initial?.params || {}), layout, shape: layout } : (initial?.params || {}),
        })}
      >{busy ? "保存中…" : "保存模板"}</button>
    </div>
  );
}
