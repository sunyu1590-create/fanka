/**
 * 个人封面的浏览器本地缓存（IndexedDB）。
 *
 * 定位：本地缓存只负责「打开就立刻有图、断网也能看」，权威数据始终在云端。
 * 因此每条记录都带 cover_version —— 云端版本更新时覆盖本地，云端删除时清空本地，
 * 绝不允许旧缓存反向覆盖云端。
 *
 * 记录按 userId 隔离，同一浏览器切换账号不会串图。
 */
const DATABASE = "heika-profile-cover-v1";
const STORE = "covers";
const SCHEMA_VERSION = 1;

export type CoverCacheRecord = {
  userId: string;
  /** 云端原始地址，用于判断是否还是同一张图 */
  url: string;
  /** 云端 cover_version */
  version: number;
  /** 云端 cover_updated_at */
  updatedAt: string | null;
  /** 图片本体；拿不到时退化为只记录版本，不阻塞页面 */
  blob?: Blob;
  cachedAt: number;
};

let databasePromise: Promise<IDBDatabase | null> | undefined;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, SCHEMA_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "userId" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

export async function readCoverCache(userId: string): Promise<CoverCacheRecord | null> {
  if (!userId) return null;
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(userId) as IDBRequest<CoverCacheRecord | undefined>;
      request.onsuccess = () => {
        const record = request.result;
        resolve(record && record.userId === userId ? record : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function put(database: IDBDatabase, record: CoverCacheRecord) {
  return new Promise<boolean>((resolve) => {
    try {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function writeCoverCache(record: CoverCacheRecord): Promise<boolean> {
  const database = await openDatabase();
  if (!database) return false;
  if (await put(database, record)) return true;
  // 存储配额不足：先清掉同账号旧记录再试一次；仍失败就放弃本地缓存，不影响云端已保存的封面。
  await clearCoverCache(record.userId);
  return put(database, record);
}

export async function clearCoverCache(userId: string): Promise<void> {
  const database = await openDatabase();
  if (!database || !userId) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(userId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** 把缓存记录变成可直接给 <img>/背景用的地址；没有图片本体时返回 null。 */
export function coverCacheObjectUrl(record: CoverCacheRecord | null | undefined): string | null {
  if (!record?.blob) return null;
  try {
    return URL.createObjectURL(record.blob);
  } catch {
    return null;
  }
}

/** 下载封面图片并写入缓存；失败返回 null（调用方继续用云端地址或旧缓存）。 */
export async function cacheCoverFromUrl(userId: string, url: string, version: number, updatedAt: string | null): Promise<CoverCacheRecord | null> {
  if (!userId || !url || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith("image/")) return null;
    const record: CoverCacheRecord = { userId, url, version, updatedAt, blob, cachedAt: Date.now() };
    const stored = await writeCoverCache(record);
    return stored ? record : null;
  } catch {
    return null;
  }
}
