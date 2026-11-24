"use client";

/**
 * 本地草稿箱：结构化内容与媒体文件都只存在当前浏览器的 IndexedDB。
 * 草稿不会上传云端，也不跨设备同步；只有正式发布成功后才会删除对应草稿。
 */

const DB_NAME = "heika-local-drafts";
const DB_VERSION = 1;
const DRAFTS = "drafts";
const FILES = "files";

export type DraftImage = {
  id: string;
  fileId?: string;
  externalUrl?: string;
  name?: string;
  type?: string;
  /** 已预上传到对象存储的路径：恢复草稿后发布可直接挂接，不必重传文件。 */
  storagePath?: string;
};

export type LocalDraft = {
  id: string;
  owner: string;
  channel: "community" | "ai";
  title: string;
  body: string;
  tag: string;
  topics: string[];
  seriesId: string | null;
  poll: { question: string; options: string[] } | null;
  contentType?: string;
  resourceData?: Record<string, string>;
  attachments: unknown[];
  coverIndex: number;
  images: DraftImage[];
  createdAt: number;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("当前浏览器不支持本地草稿")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS)) {
        const store = db.createObjectStore(DRAFTS, { keyPath: "id" });
        store.createIndex("owner", "owner");
        store.createIndex("ownerUpdated", ["owner", "updatedAt"]);
      }
      if (!db.objectStoreNames.contains(FILES)) {
        const files = db.createObjectStore(FILES, { keyPath: ["draftId", "fileId"] });
        files.createIndex("draftId", "draftId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地草稿打开失败"));
  });
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地草稿操作失败"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("本地草稿写入失败"));
    tx.onabort = () => reject(tx.error || new Error("本地草稿写入被中断"));
  });
}

export async function listDrafts(owner: string): Promise<LocalDraft[]> {
  const db = await openDb();
  const tx = db.transaction(DRAFTS, "readonly");
  const index = tx.objectStore(DRAFTS).index("owner");
  const rows = await wrap(index.getAll(owner) as IDBRequest<LocalDraft[]>);
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(owner: string, id: string): Promise<LocalDraft | null> {
  const db = await openDb();
  const row = await wrap(db.transaction(DRAFTS, "readonly").objectStore(DRAFTS).get(id) as IDBRequest<LocalDraft | undefined>);
  if (!row || row.owner !== owner) return null;
  return row;
}

export async function getDraftFile(draftId: string, fileId: string): Promise<Blob | null> {
  const db = await openDb();
  const row = await wrap(db.transaction(FILES, "readonly").objectStore(FILES).get([draftId, fileId]) as IDBRequest<{ blob?: Blob } | undefined>);
  return row?.blob instanceof Blob ? row.blob : null;
}

export async function saveDraft(draft: LocalDraft, files: { fileId: string; blob: Blob }[] = []): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([DRAFTS, FILES], "readwrite");
  tx.objectStore(DRAFTS).put(draft);
  const fileStore = tx.objectStore(FILES);
  for (const file of files) fileStore.put({ draftId: draft.id, fileId: file.fileId, blob: file.blob });
  try {
    await txDone(tx);
  } catch (error) {
    // 容量不足时给出明确提示，避免静默丢失。
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)) {
      throw new Error("本地存储空间不足，请删除一些草稿或图片后重试");
    }
    throw error;
  }
}

/** 删除草稿本体后，顺带清掉它的媒体副本，避免存储越用越满。 */
export async function deleteDraft(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([DRAFTS, FILES], "readwrite");
  tx.objectStore(DRAFTS).delete(id);
  const index = tx.objectStore(FILES).index("draftId");
  const keys = await wrap(index.getAllKeys(id) as IDBRequest<IDBValidKey[]>);
  for (const key of keys) tx.objectStore(FILES).delete(key);
  await txDone(tx);
}

export async function clearDrafts(owner: string): Promise<void> {
  const drafts = await listDrafts(owner);
  for (const draft of drafts) await deleteDraft(draft.id);
}

export async function countDrafts(owner: string): Promise<number> {
  try {
    const db = await openDb();
    const index = db.transaction(DRAFTS, "readonly").objectStore(DRAFTS).index("owner");
    return await wrap(index.count(owner) as IDBRequest<number>);
  } catch { return 0; }
}

export function draftHasContent(draft: Partial<LocalDraft>): boolean {
  return Boolean(
    (draft.title || "").trim() ||
    (draft.body || "").trim() ||
    (draft.images || []).length ||
    (draft.attachments || []).length ||
    (draft.poll?.question || "").trim() ||
    (draft.poll?.options || []).some((option) => (option || "").trim()),
  );
}

/**
 * 旧版把草稿存在 localStorage 并在打开发布页时自动填充。
 * 这里把历史内容搬进草稿箱，并清掉旧键，之后不再自动恢复。
 */
export async function migrateLegacyDrafts(owner: string): Promise<number> {
  if (typeof localStorage === "undefined") return 0;
  const keys = [`heika-compose-community-${owner}`, `heika-compose-ai-${owner}`, `heika-compose-${owner}`];
  let migrated = 0;
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const saved = JSON.parse(raw) as { title?: string; body?: string; tag?: string; topics?: string[]; seriesId?: string | null; poll?: { question?: string; options?: string[] }; channel?: "community" | "ai"; contentType?: string; resourceData?: Record<string, string>; attachments?: unknown[]; coverIndex?: number; images?: { id: string; path?: string; url?: string; external?: boolean }[]; video?: { id: string; name?: string; size?: number; type?: string } | null };
      const channel = saved.channel === "ai" ? "ai" : "community";
      const draft: LocalDraft = {
        id: `legacy-${key}`,
        owner,
        channel,
        title: saved.title || "",
        body: saved.body || "",
        tag: saved.tag || "",
        topics: saved.topics || [],
        seriesId: saved.seriesId || null,
        poll: saved.poll?.question ? { question: saved.poll.question, options: saved.poll.options || [] } : null,
        contentType: saved.contentType,
        resourceData: saved.resourceData,
        attachments: saved.attachments || [],
        coverIndex: saved.coverIndex || 0,
        // 旧草稿的图片可能已经上传到云端，这里保留外链；本地文件需要用户重新选择。
        images: (saved.images || []).map((image) => ({ id: image.id, externalUrl: image.url, name: image.id })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (draftHasContent(draft)) {
        await saveDraft(draft);
        migrated += 1;
      }
      localStorage.removeItem(key);
    } catch {
      // 损坏的旧草稿不再阻断发布页，保留原键以免误删。
    }
  }
  return migrated;
}
