"use client";

/**
 * 全局发布悬浮窗口 + 发布任务管理中心。
 *
 * 挂载在应用根部（不属于任何单页），发布任务在页面切换期间保持稳定：
 * - 最小化：环形进度 + 状态 + 百分比 + 已就绪图片数；支持拖动，不遮挡底栏与安全区；
 * - 展开：任务详情面板（非模态，不模糊/压暗整页），单张明细、阶段流水、返回创作、取消；
 * - 多任务：展开面板顶部可直接切换正在进行的任务，不打断任何一个；
 * - 结果：成功/待审提示 6 秒后自动收起（任务不删除），失败保留任务与重试入口；
 * - 任务中心：全部 / 正在发布 / 等待审核 / 发布失败 / 审核未通过 / 已完成 / 已取消。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  publishTaskManager,
  PUBLISH_SETTLED,
  PUBLISH_STATUS_LABEL,
  type PublishTask,
  type PublishTaskStatus,
} from "@/lib/publish-task-manager";
import { uploadManager, UPLOAD_STATUS_LABEL, type UploadManagerSnapshot } from "@/lib/upload-manager";

const TERMINAL: PublishTaskStatus[] = PUBLISH_SETTLED;
const RESULT_VISIBLE_MS = 6000;

const FILTERS: { key: string; label: string; match: (task: PublishTask) => boolean }[] = [
  { key: "all", label: "全部", match: () => true },
  { key: "running", label: "正在发布", match: (task) => ["draft_snapshot_saved", "task_created", "waiting_for_media", "uploading_media", "verifying_media", "submitting_content", "publishing"].includes(task.status) },
  { key: "review", label: "等待审核", match: (task) => ["ai_classifying", "ai_reviewing", "waiting_for_human_review"].includes(task.status) },
  { key: "failed", label: "发布失败", match: (task) => task.status === "failed" },
  { key: "rejected", label: "审核未通过", match: (task) => task.status === "rejected" },
  { key: "done", label: "已完成", match: (task) => task.status === "published" },
  { key: "cancelled", label: "已取消", match: (task) => task.status === "cancelled" },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSpeed(bps: number) {
  if (!bps) return "—";
  return `${formatBytes(bps)}/s`;
}

function Ring({ percent, size = 44 }: { percent: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="pf-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} className="pf-ring-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="pf-ring-value"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

/** 任务整体进度：优先用真实字节，字节未知时退化为就绪张数；已完成/待审固定 100。 */
export function taskPercent(task: PublishTask | null) {
  if (!task) return 0;
  if (["published", "waiting_for_human_review"].includes(task.status)) return 100;
  if (task.media.totalBytes > 0) return Math.min(99, Math.round((task.media.sentBytes / task.media.totalBytes) * 100));
  if (task.media.total > 0) return Math.min(99, Math.round((task.media.ready / task.media.total) * 100));
  return ["submitting_content", "ai_classifying", "ai_reviewing", "publishing"].includes(task.status) ? 92 : 6;
}

export function PublishFloatingWindow({
  taskCenterOpen,
  onOpenTaskCenter,
  onCloseTaskCenter,
  onOpenPost,
  onRetryPublish,
  onResumeCompose,
}: {
  taskCenterOpen: boolean;
  onOpenTaskCenter: () => void;
  onCloseTaskCenter: () => void;
  onOpenPost?: (task: PublishTask) => void;
  /** 失败任务重新提交：回到创作页继续（草稿在失败时仍保留）。 */
  onRetryPublish?: (task: PublishTask) => void;
  /** 回到创作页并恢复当时现场（标题/正文/图片/封面/分类/话题/合集）。 */
  onResumeCompose?: (task: PublishTask) => void;
}) {
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [active, setActive] = useState<PublishTask | null>(null);
  const [uploads, setUploads] = useState<UploadManagerSnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState("all");
  const [position, setPosition] = useState<{ right: number; bottom: number }>({ right: 16, bottom: 96 });
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const off = publishTaskManager.subscribe((list, current) => {
      setTasks(list);
      setActive(current);
      setHidden(publishTaskManager.hidden);
    });
    const offUploads = uploadManager.subscribe((snapshot) => setUploads(snapshot));
    try {
      const saved = localStorage.getItem("heika-pf-position");
      if (saved) {
        const parsed = JSON.parse(saved) as { right: number; bottom: number };
        if (Number.isFinite(parsed.right) && Number.isFinite(parsed.bottom)) setPosition(parsed);
      }
    } catch { /* 位置持久化失败用默认值 */ }
    return () => { off(); offUploads(); };
  }, []);

  const recentlyFinished = tasks.find((task) => TERMINAL.includes(task.status) && Date.now() - task.updatedAt < 15_000);

  // 成功/待审/失败提示短暂停留后自动收起；任务本身仍留在任务中心。
  useEffect(() => {
    if (!recentlyFinished) return;
    const timer = window.setTimeout(() => {
      setHidden(true);
      publishTaskManager.hidden = true;
    }, RESULT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [recentlyFinished?.taskKey, recentlyFinished?.status, recentlyFinished?.updatedAt]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    dragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }, []);
  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setPosition((current) => {
      const right = Math.min(Math.max(8, current.right - dx), Math.max(8, window.innerWidth - 120));
      const bottom = Math.min(Math.max(8, current.bottom - dy), Math.max(8, window.innerHeight - 80));
      return { right, bottom };
    });
    drag.startX = event.clientX;
    drag.startY = event.clientY;
  }, []);
  const onPointerUp = useCallback(() => {
    if (dragRef.current?.moved) {
      setPosition((current) => {
        try { localStorage.setItem("heika-pf-position", JSON.stringify(current)); } catch { /* 忽略 */ }
        return current;
      });
    }
    dragRef.current = null;
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    publishTaskManager.hidden = true;
  }, []);

  const visible = Boolean(active || recentlyFinished) && !hidden && !taskCenterOpen;
  const percent = taskPercent(active);
  const runningTasks = tasks.filter((task) => !TERMINAL.includes(task.status));
  const mediaRows = (active?.snapshot?.media || []).map((media) => ({
    media,
    upload: uploads?.items.find((item) => item.uploadId === media.id) || null,
  }));

  return (
    <>
      {visible && active && (
        <div
          className={`publish-float${expanded ? " is-expanded" : ""}`}
          style={{ right: position.right, bottom: `calc(${position.bottom}px + env(safe-area-inset-bottom, 0px))` }}
          role="status"
          aria-live="polite"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <button
            type="button"
            className="publish-float-mini"
            onClick={() => { if (!dragRef.current?.moved) setExpanded((value) => !value); }}
            aria-expanded={expanded}
            aria-label={`发布任务：${PUBLISH_STATUS_LABEL[active.status]}`}
          >
            <Ring percent={percent} />
            <span className="publish-float-copy">
              <strong>{PUBLISH_STATUS_LABEL[active.status]}</strong>
              <small>
                {active.status === "waiting_for_human_review"
                  ? active.title
                  : `${percent}% · 图片 ${active.media.ready}/${active.media.total}`}
              </small>
            </span>
          </button>
          <button type="button" className="publish-float-hide" aria-label="隐藏浮窗（不取消任务）" onClick={hide}>×</button>
          {expanded && (
            <div className="publish-float-panel" onPointerDown={(event) => event.stopPropagation()}>
              {runningTasks.length > 1 && (
                <div className="publish-float-switch" role="tablist" aria-label="切换发布任务">
                  {runningTasks.slice(0, 4).map((task) => (
                    <button
                      key={task.taskKey}
                      type="button"
                      role="tab"
                      aria-selected={task.taskKey === active.taskKey}
                      className={task.taskKey === active.taskKey ? "selected" : ""}
                      onClick={() => publishTaskManager.focus(task.taskKey)}
                    >
                      {task.title || "未命名"} · {taskPercent(task)}%
                    </button>
                  ))}
                </div>
              )}
              <header>
                <strong>{active.title || "未命名作品"}</strong>
                <small>{PUBLISH_STATUS_LABEL[active.status]} · {active.steps[active.steps.length - 1]?.label || "准备中"}</small>
              </header>
              {active.coverUrl && <img className="publish-float-cover" src={active.coverUrl} alt="封面缩略图" />}
              <div className="publish-float-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
              <dl>
                <div><dt>总体进度</dt><dd>{percent}%</dd></div>
                <div><dt>图片</dt><dd>{active.media.ready} 成功 · {active.media.uploading} 上传中 · {active.media.failed} 失败</dd></div>
                <div><dt>上传速度</dt><dd>{formatSpeed(active.speedBps || uploads?.speedBps || 0)}</dd></div>
                <div><dt>已传输</dt><dd>{formatBytes(active.media.sentBytes)} / {formatBytes(active.media.totalBytes)}</dd></div>
              </dl>
              {mediaRows.length > 0 && (
                <ul className="publish-float-media">
                  {mediaRows.slice(0, 9).map(({ media, upload: item }, index) => (
                    <li key={media.id}>
                      <span className="publish-float-media-index">{index + 1}</span>
                      <span className="publish-float-media-name">{media.name || `图片 ${index + 1}`}</span>
                      <span className={`publish-float-media-state is-${item?.status || (media.path ? "ready" : "queued")}`}>
                        {item ? UPLOAD_STATUS_LABEL[item.status] : media.path ? "已就绪" : "等待上传"}
                        {item?.status === "uploading" ? ` ${item.progress}%` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {active.error && <p className="publish-float-error">{active.error}</p>}
              <ol className="publish-float-steps">
                {active.steps.slice(-5).map((step) => <li key={`${step.at}-${step.label}`}><span>{step.label}</span></li>)}
              </ol>
              <div className="publish-float-actions">
                {onResumeCompose && (
                  <button type="button" className="soft-button" onClick={() => { setExpanded(false); onResumeCompose(active); }}>返回创作</button>
                )}
                <button type="button" className="soft-button" onClick={onOpenTaskCenter}>任务详情</button>
                <button type="button" className="soft-button" onClick={() => publishTaskManager.cancel(active.taskKey)}>取消发布</button>
              </div>
            </div>
          )}
        </div>
      )}
      {visible && !active && recentlyFinished && (
        <div
          className={`publish-float is-result is-${recentlyFinished.status}`}
          style={{ right: position.right, bottom: `calc(${position.bottom}px + env(safe-area-inset-bottom, 0px))` }}
          role="status"
          aria-live="polite"
        >
          <span className="publish-float-result-icon" aria-hidden="true">{recentlyFinished.status === "published" ? "✓" : recentlyFinished.status === "waiting_for_human_review" ? "⌛" : "!"}</span>
          <span className="publish-float-copy">
            <strong>
              {recentlyFinished.status === "published" ? "发布成功"
                : recentlyFinished.status === "waiting_for_human_review" ? "已提交审核"
                : recentlyFinished.status === "rejected" ? "审核未通过" : recentlyFinished.status === "cancelled" ? "已取消发布" : "发布失败"}
            </strong>
            <small>{recentlyFinished.title}{recentlyFinished.status === "waiting_for_human_review" ? " · 无需等待，结果会通知你" : ""}</small>
          </span>
          {recentlyFinished.status === "published" && onOpenPost && (
            <button type="button" className="soft-button" onClick={() => onOpenPost(recentlyFinished)}>查看作品</button>
          )}
          {recentlyFinished.status === "failed" && onResumeCompose && (
            <button type="button" className="soft-button" onClick={() => onResumeCompose(recentlyFinished)}>返回创作</button>
          )}
          <button type="button" className="publish-float-hide" aria-label="关闭提示" onClick={hide}>×</button>
        </div>
      )}
      {taskCenterOpen && (
        <div className="publish-task-center" role="dialog" aria-label="发布任务中心">
          <header>
            <h2>发布任务</h2>
            <div>
              <button type="button" className="soft-button" onClick={() => publishTaskManager.clearFinished()}>清理已结束</button>
              <button type="button" className="soft-button" onClick={onCloseTaskCenter}>关闭</button>
            </div>
          </header>
          <nav className="publish-task-filters">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={filter === item.key ? "selected" : ""}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <ul className="publish-task-list">
            {tasks.filter(FILTERS.find((item) => item.key === filter)?.match || (() => true)).map((task) => (
              <li key={task.taskKey} className={`publish-task-item is-${task.status}`}>
                <div className="publish-task-item-head">
                  <strong>{task.title || "未命名作品"}</strong>
                  <span>{PUBLISH_STATUS_LABEL[task.status]}</span>
                </div>
                <p>
                  图片 {task.media.ready}/{task.media.total}
                  {task.media.failed ? ` · 失败 ${task.media.failed}` : ""}
                  {" · "}{new Date(task.createdAt).toLocaleString("zh-CN")}
                </p>
                {task.error && <p className="publish-float-error">{task.error}</p>}
                <div className="publish-task-item-actions">
                  {!TERMINAL.includes(task.status) && (
                    <button type="button" className="soft-button" onClick={() => publishTaskManager.cancel(task.taskKey)}>取消发布</button>
                  )}
                  {!TERMINAL.includes(task.status) && onResumeCompose && (
                    <button type="button" className="soft-button" onClick={() => { onCloseTaskCenter(); onResumeCompose(task); }}>返回创作</button>
                  )}
                  {task.status === "published" && onOpenPost && (
                    <button type="button" className="soft-button" onClick={() => onOpenPost(task)}>查看正式作品</button>
                  )}
                  {task.status === "failed" && onResumeCompose && (
                    <button type="button" className="soft-button" onClick={() => { onCloseTaskCenter(); onResumeCompose(task); }}>返回创作</button>
                  )}
                  {task.status === "failed" && (
                    <button type="button" className="soft-button" onClick={() => { onCloseTaskCenter(); onRetryPublish?.(task); }}>重新提交</button>
                  )}
                  {TERMINAL.includes(task.status) && (
                    <button type="button" className="soft-button" onClick={() => publishTaskManager.clearFinished()}>清理</button>
                  )}
                </div>
              </li>
            ))}
            {!tasks.filter(FILTERS.find((item) => item.key === filter)?.match || (() => true)).length && (
              <li className="publish-task-empty">暂无任务记录</li>
            )}
          </ul>
          {uploads && uploads.items.length > 0 && (
            <section className="publish-task-uploads">
              <h3>媒体上传明细</h3>
              <ul>
                {uploads.items.slice(0, 12).map((item) => (
                  <li key={item.taskId}>
                    <span>{item.name}</span>
                    <span>{UPLOAD_STATUS_LABEL[item.status]}{item.status === "uploading" ? ` ${item.progress}%` : ""}</span>
                    {item.status === "failed" && <button type="button" className="soft-button" onClick={() => uploadManager.retry(item.taskId)}>重试</button>}
                    {item.status === "failed" && <button type="button" className="soft-button" onClick={() => uploadManager.cancel(item.taskId)}>删除</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
