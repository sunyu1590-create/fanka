/**
 * 全局媒体上传管理器（网页端）。
 *
 * 设计要求（HEIKA 发布基础设施重构）：
 * - 上传任务不绑定发布页组件生命周期：模块级单例，SPA 切页不中断；
 * - 每个文件有唯一媒体 ID / 任务 ID，绝不拿数组当下标当标识；
 * - 明确状态机：created → preparing → compressing → queued → uploading → verifying → ready/failed/cancelled；
 * - 错误分类：可重试（网络/超时/5xx/429）用 1s/3s/8s 退避 + 抖动，不可重试立即失败；
 * - 已成功的文件不因其他文件失败而重传（upload_id 幂等 + 结果缓存）；
 * - 真实字节进度与整体进度（含速度），禁止定时器模拟；
 * - 任务元数据持久化到 IndexedDB，刷新后任务中心可查，未完成任务在下次发布时可恢复；
 * - 网络断开暂停派发，恢复后自动继续。
 */

import {
  uploadMediaFile,
  MediaUploadError,
  type MediaUploadProgress,
  type MediaUploadResult,
  type MediaUploadTarget,
} from "@/lib/media-upload";

export type UploadItemStatus =
  | "created"
  | "preparing"
  | "compressing"
  | "queued"
  | "uploading"
  | "verifying"
  | "ready"
  | "failed"
  | "cancelled";

export type UploadTaskItem = {
  mediaId: string;
  taskId: string;
  uploadId: string;
  name: string;
  size: number;
  status: UploadItemStatus;
  /** 0–100，真实字节进度；verifying 阶段保持 100。 */
  progress: number;
  bytesSent: number;
  attempts: number;
  error?: string;
  resultCode?: string;
  result?: MediaUploadResult;
  createdAt: number;
  updatedAt: number;
};

export type UploadManagerSnapshot = {
  items: UploadTaskItem[];
  totalBytes: number;
  sentBytes: number;
  overallPercent: number;
  readyCount: number;
  uploadingCount: number;
  queuedCount: number;
  failedCount: number;
  speedBps: number;
  paused: boolean;
};

type Listener = (snapshot: UploadManagerSnapshot) => void;

const DB_NAME = "heika-upload-manager";
const DB_VERSION = 1;
const STORE = "tasks";
const RETRY_DELAYS_MS = [1000, 3000, 8000];
const HISTORY_LIMIT = 200;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "taskId" });
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

async function persistItems(items: UploadTaskItem[]) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadHistory(): Promise<UploadTaskItem[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        const items = (request.result || []) as UploadTaskItem[];
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(items.slice(0, HISTORY_LIMIT));
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

class UploadManager {
  private items = new Map<string, UploadTaskItem>();
  private listeners = new Set<Listener>();
  private queue: string[] = [];
  private active = 0;
  private paused = false;
  private speedWindow: { at: number; bytes: number }[] = [];
  private cumulativeSent = 0;
  private loaded = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.paused = false;
        this.pump();
        this.emit();
      });
      window.addEventListener("offline", () => {
        this.paused = true;
        this.emit();
      });
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async history(): Promise<UploadTaskItem[]> {
    await this.ensureLoaded();
    return [...this.items.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  snapshot(): UploadManagerSnapshot {
    const items = [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt);
    const activeItems = items.filter((item) => ["queued", "uploading", "verifying", "ready", "failed"].includes(item.status) || item.status === "preparing" || item.status === "compressing");
    const totalBytes = activeItems.reduce((sum, item) => sum + item.size, 0);
    const sentBytes = activeItems.reduce((sum, item) => sum + (item.status === "ready" ? item.size : item.bytesSent), 0);
    const speedBps = this.currentSpeed();
    return {
      items,
      totalBytes,
      sentBytes,
      overallPercent: totalBytes ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0,
      readyCount: items.filter((item) => item.status === "ready").length,
      uploadingCount: items.filter((item) => item.status === "uploading" || item.status === "verifying").length,
      queuedCount: items.filter((item) => item.status === "queued" || item.status === "preparing" || item.status === "compressing").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      speedBps,
      paused: this.paused,
    };
  }

  /**
   * 入队一个上传任务。返回与 uploadMediaFile 一致的结果。
   * 同一 uploadId 重复入队时，若已有成功结果直接复用（禁止重复上传已成功文件）。
   */
  enqueue(input: {
    file: File;
    token: string;
    uploadId: string;
    sortOrder: number;
    target: MediaUploadTarget;
    onProgress?: (progress: MediaUploadProgress) => void;
    timeoutMs?: number;
  }): Promise<MediaUploadResult> {
    const mediaId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const existing = [...this.items.values()].find((item) => item.uploadId === input.uploadId && item.status === "ready" && item.result);
    if (existing?.result) {
      input.onProgress?.({ percent: 100, phase: "done" });
      return Promise.resolve(existing.result);
    }
    const item: UploadTaskItem = {
      mediaId,
      taskId,
      uploadId: input.uploadId,
      name: input.file.name || `${input.uploadId}`,
      size: input.file.size,
      status: "queued",
      progress: 0,
      bytesSent: 0,
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.items.set(taskId, item);
    void this.ensureLoaded().then(() => persistItems([item]));
    this.emit();
    return new Promise<MediaUploadResult>((resolve, reject) => {
      this.queue.push(taskId);
      this.pending.set(taskId, { input, resolve, reject });
      this.pump();
    });
  }

  cancel(taskId: string) {
    const item = this.items.get(taskId);
    if (!item || item.status === "ready") return;
    this.abortControllers.get(taskId)?.abort();
    this.update(taskId, { status: "cancelled", error: "已取消" });
    const pending = this.pending.get(taskId);
    if (pending) {
      this.pending.delete(taskId);
      pending.reject(new MediaUploadError("上传已取消", 0, false));
    }
  }

  retry(taskId: string) {
    const item = this.items.get(taskId);
    if (!item || item.status === "ready") return;
    this.update(taskId, { status: "queued", error: undefined, progress: 0, bytesSent: 0 });
    this.queue.push(taskId);
    this.pump();
  }

  private pending = new Map<string, {
    input: { file: File; token: string; uploadId: string; sortOrder: number; target: MediaUploadTarget; onProgress?: (progress: MediaUploadProgress) => void; timeoutMs?: number };
    resolve: (result: MediaUploadResult) => void;
    reject: (error: unknown) => void;
  }>();
  private abortControllers = new Map<string, AbortController>();

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const history = await loadHistory();
    for (const item of history) {
      if (!this.items.has(item.taskId)) {
        // 刷新页面后，未完成任务不再继续占用队列（文件对象已丢失），保留记录供任务中心展示。
        if (["queued", "uploading", "verifying", "preparing", "compressing"].includes(item.status)) {
          item.status = "failed";
          item.error = "页面已刷新，任务中断；重新上传同名文件即可续传（相同图片不会重复入库）";
          item.updatedAt = Date.now();
        }
        this.items.set(item.taskId, item);
      }
    }
  }

  private update(taskId: string, patch: Partial<UploadTaskItem>) {
    const item = this.items.get(taskId);
    if (!item) return;
    Object.assign(item, patch, { updatedAt: Date.now() });
    this.items.set(taskId, item);
    void persistItems([item]);
    this.emit();
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private currentSpeed() {
    const now = Date.now();
    this.speedWindow = this.speedWindow.filter((entry) => now - entry.at < 5000);
    if (this.speedWindow.length < 2) return 0;
    const first = this.speedWindow[0];
    const last = this.speedWindow[this.speedWindow.length - 1];
    const seconds = Math.max(0.5, (last.at - first.at) / 1000);
    return Math.round((last.bytes - first.bytes) / seconds);
  }

  private pump() {
    if (this.paused) return;
    while (this.active < 3 && this.queue.length) {
      const taskId = this.queue.shift()!;
      const entry = this.pending.get(taskId);
      const item = this.items.get(taskId);
      if (!entry || !item) continue;
      if (item.status === "cancelled") {
        this.pending.delete(taskId);
        continue;
      }
      this.active += 1;
      void this.run(taskId, entry).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async run(taskId: string, entry: { input: Parameters<typeof uploadMediaFile>[0]; resolve: (r: MediaUploadResult) => void; reject: (e: unknown) => void }) {
    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);
    let attempt = 0;
    let lastError: unknown;
    try {
      while (attempt < 3) {
        const item = this.items.get(taskId);
        if (!item || item.status === "cancelled") throw new MediaUploadError("上传已取消", 0, false);
        this.update(taskId, { status: attempt === 0 ? "uploading" : "uploading", attempts: attempt + 1, error: undefined });
        try {
          const result = await uploadMediaFile({
            ...entry.input,
            signal: controller.signal,
            onProgress: (progress) => {
              const current = this.items.get(taskId);
              if (current) {
                const bytes = progress.phase === "uploading" ? Math.round((progress.percent / 100) * current.size) : current.size;
                if (bytes > current.bytesSent) {
                  this.cumulativeSent += bytes - current.bytesSent;
                  this.speedWindow.push({ at: Date.now(), bytes: this.cumulativeSent });
                  if (this.speedWindow.length > 120) this.speedWindow = this.speedWindow.slice(-120);
                }
                this.update(taskId, {
                  progress: progress.percent,
                  bytesSent: bytes,
                  status: progress.phase === "processing" ? "verifying" : "uploading",
                });
              }
              entry.input.onProgress?.(progress);
            },
          });
          this.update(taskId, { status: "ready", progress: 100, bytesSent: this.items.get(taskId)?.size ?? 0, result });
          this.pending.delete(taskId);
          this.abortControllers.delete(taskId);
          entry.resolve(result);
          return;
        } catch (error) {
          lastError = error;
          const retryable = error instanceof MediaUploadError ? error.retryable : true;
          if (!retryable || attempt === 2) break;
          attempt += 1;
          const delay = RETRY_DELAYS_MS[attempt - 1] ?? 8000;
          const jitter = Math.round(Math.random() * 400);
          this.update(taskId, { status: "queued", error: error instanceof Error ? error.message : "上传失败，准备重试" });
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
      }
      const message = lastError instanceof Error ? lastError.message : "图片上传失败";
      this.update(taskId, { status: "failed", error: message });
      this.pending.delete(taskId);
      this.abortControllers.delete(taskId);
      entry.reject(lastError instanceof Error ? lastError : new MediaUploadError(message, 0, true));
    } catch (error) {
      this.update(taskId, { status: "failed", error: error instanceof Error ? error.message : "上传失败" });
      this.pending.delete(taskId);
      this.abortControllers.delete(taskId);
      entry.reject(error);
    }
  }

  private sentBase(_taskId: string) {
    return this.cumulativeSent;
  }
}

export const uploadManager = new UploadManager();

/** 供发布任务系统/UI 使用的状态中文映射。 */
export const UPLOAD_STATUS_LABEL: Record<UploadItemStatus, string> = {
  created: "待处理",
  preparing: "正在读取",
  compressing: "正在压缩",
  queued: "等待上传",
  uploading: "正在上传",
  verifying: "正在校验",
  ready: "上传成功",
  failed: "上传失败",
  cancelled: "已取消",
};
