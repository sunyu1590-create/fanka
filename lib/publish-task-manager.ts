/**
 * 全局发布任务管理器（网页端）。
 *
 * 发布与创作页面解耦：点击发布即生成不可变内容快照 + 唯一发布任务，
 * 任务挂模块级单例（不随页面卸载消失），状态持久化到 IndexedDB 并镜像到服务端
 * `publish_tasks`（服务端状态为最终事实）。全局悬浮窗与任务中心都订阅这里的事件。
 */

export type PublishTaskStatus =
  | "draft_snapshot_saved"
  | "task_created"
  | "waiting_for_media"
  | "uploading_media"
  | "verifying_media"
  | "submitting_content"
  | "ai_classifying"
  | "ai_reviewing"
  | "waiting_for_human_review"
  | "publishing"
  | "published"
  | "failed"
  | "rejected"
  | "cancelled";

export type PublishTaskMedia = {
  total: number;
  ready: number;
  uploading: number;
  failed: number;
  sentBytes: number;
  totalBytes: number;
};

export type PublishTask = {
  taskKey: string;
  title: string;
  coverUrl?: string | null;
  status: PublishTaskStatus;
  media: PublishTaskMedia;
  speedBps: number;
  error?: string | null;
  postId?: string | null;
  clientId?: number | null;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number | null;
  /** 任务步骤流水（最新在后），供展开面板展示。 */
  steps: { label: string; at: number }[];
  /** 内容快照：离开编辑器后任务仍能继续提交。 */
  snapshot?: {
    title: string;
    body: string;
    tag: string;
    topics: string[];
    mediaPaths: string[];
    coverUrl?: string | null;
    seriesId?: string | null;
  };
};

type Listener = (tasks: PublishTask[], active: PublishTask | null) => void;

const DB_NAME = "heika-publish-tasks";
const DB_VERSION = 1;
const STORE = "tasks";
const HISTORY_LIMIT = 100;

export const PUBLISH_STATUS_LABEL: Record<PublishTaskStatus, string> = {
  draft_snapshot_saved: "已保存内容快照",
  task_created: "任务已创建",
  waiting_for_media: "等待图片就绪",
  uploading_media: "正在上传图片",
  verifying_media: "正在校验媒体",
  submitting_content: "正在提交内容",
  ai_classifying: "AI 自动分类",
  ai_reviewing: "AI 安全审核",
  waiting_for_human_review: "已提交审核",
  publishing: "正在发布",
  published: "发布成功",
  failed: "发布失败",
  rejected: "审核未通过",
  cancelled: "已取消",
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "taskKey" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

class PublishTaskManager {
  private tasks = new Map<string, PublishTask>();
  private listeners = new Set<Listener>();
  private loaded = false;
  /** 最小化浮窗是否隐藏（隐藏≠取消任务）。 */
  hidden = false;

  constructor() {
    void this.ensureLoaded();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.list(), this.active());
    return () => this.listeners.delete(listener);
  }

  list(): PublishTask[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  active(): PublishTask | null {
    const running = this.list().find((task) => !["published", "failed", "rejected", "cancelled"].includes(task.status));
    return running || null;
  }

  get(taskKey: string) {
    return this.tasks.get(taskKey) || null;
  }

  async create(input: { title: string; coverUrl?: string | null; snapshot: PublishTask["snapshot"] }): Promise<PublishTask> {
    await this.ensureLoaded();
    const now = Date.now();
    const task: PublishTask = {
      taskKey: crypto.randomUUID(),
      title: input.title.slice(0, 80),
      coverUrl: input.coverUrl ?? null,
      status: "draft_snapshot_saved",
      media: { total: input.snapshot?.mediaPaths.length || 0, ready: 0, uploading: 0, failed: 0, sentBytes: 0, totalBytes: 0 },
      speedBps: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
      steps: [{ label: "内容快照已保存", at: now }],
      snapshot: input.snapshot,
    };
    this.tasks.set(task.taskKey, task);
    this.hidden = false;
    this.persist(task);
    this.emit();
    void this.syncServer(task, "create");
    return task;
  }

  update(taskKey: string, patch: Partial<PublishTask> & { step?: string }) {
    const task = this.tasks.get(taskKey);
    if (!task) return;
    const { step, ...rest } = patch;
    Object.assign(task, rest, { updatedAt: Date.now() });
    if (step) task.steps = [...task.steps.slice(-19), { label: step, at: Date.now() }];
    if (["published", "failed", "rejected", "cancelled"].includes(task.status)) task.finishedAt = Date.now();
    this.tasks.set(taskKey, task);
    this.persist(task);
    this.emit();
    void this.syncServer(task, "update");
  }

  cancel(taskKey: string) {
    this.update(taskKey, { status: "cancelled", step: "用户取消发布" });
  }

  clearFinished() {
    for (const [key, task] of [...this.tasks]) {
      if (["published", "cancelled"].includes(task.status)) this.tasks.delete(key);
    }
    this.emit();
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).getAll();
        request.onsuccess = () => {
          const items = (request.result || []) as PublishTask[];
          items.sort((a, b) => b.updatedAt - a.updatedAt);
          for (const item of items.slice(0, HISTORY_LIMIT)) {
            // 刷新后不再有文件对象；进行中任务标记失败并提示恢复方式。
            if (!["published", "failed", "rejected", "cancelled"].includes(item.status)) {
              item.status = "failed";
              item.error = "页面已刷新，发布任务中断；重新进入创作页发布即可继续（同名图片会复用已上传结果）";
              item.updatedAt = Date.now();
            }
            this.tasks.set(item.taskKey, item);
          }
          resolve();
        };
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private persist(task: PublishTask) {
    void openDb().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(task);
      } catch {
        /* 持久化失败不阻断任务执行。 */
      }
    });
  }

  private emit() {
    const list = this.list();
    const active = this.active();
    for (const listener of this.listeners) listener(list, active);
  }

  /** 镜像到服务端 publish_tasks（失败不阻断；服务端用于任务中心与管理端可见性）。 */
  private async syncServer(task: PublishTask, mode: "create" | "update") {
    try {
      const { cloudRequest } = await import("@/lib/cloud");
      if (mode === "create") {
        await cloudRequest("/api/v1/publish-tasks", {
          task_key: task.taskKey,
          title: task.title,
          cover_path: task.snapshot?.coverUrl ?? null,
          media_paths: task.snapshot?.mediaPaths ?? [],
          status: task.status,
          client_type: "web",
        });
      } else {
        await cloudRequest(`/api/v1/publish-tasks?task_key=${encodeURIComponent(task.taskKey)}`, {
          status: task.status,
          title: task.title,
          post_id: task.postId ?? null,
          error_message: task.error ?? null,
        }, "PATCH");
      }
    } catch {
      /* 网络抖动不影响本地任务状态。 */
    }
  }
}

export const publishTaskManager = new PublishTaskManager();
