type CacheRecord<T = unknown> = {
  key: string;
  value: T;
  savedAt: number;
  accessedAt: number;
  bytes: number;
};

type PendingWrite = { key: string; value: unknown };

export type PublicCacheRead<T> = {
  value: T;
  savedAt: number;
  stale: boolean;
};

const DATABASE = "heika-public-content-v1";
const STORE = "entries";
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_RECORD_BYTES = 768 * 1024;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_FRESH_MS = 24 * 60 * 60 * 1000;

let databasePromise: Promise<IDBDatabase | null> | undefined;
const pendingWrites = new Map<string, PendingWrite>();
let flushScheduled = false;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }).catch(() => null);
  return databasePromise ?? Promise.resolve(null);
}

export async function readPublicCache<T>(
  key: string,
  freshForMs = DEFAULT_FRESH_MS,
): Promise<PublicCacheRead<T> | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.get(key) as IDBRequest<CacheRecord<T> | undefined>;
      request.onsuccess = () => {
        const record = request.result;
        if (!record || Date.now() - record.savedAt > MAX_STALE_MS) {
          if (record) store.delete(key);
          resolve(null);
          return;
        }
        record.accessedAt = Date.now();
        store.put(record);
        resolve({
          value: record.value,
          savedAt: record.savedAt,
          stale: Date.now() - record.savedAt > freshForMs,
        });
      };
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function schedulePublicCacheWrite<T>(key: string, value: T) {
  pendingWrites.set(key, { key, value });
  if (flushScheduled || typeof window === "undefined") return;
  flushScheduled = true;
  const flush = () => { void flushWrites(); };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(flush, { timeout: 1_500 });
  } else {
    globalThis.setTimeout(flush, 250);
  }
}

export async function removePublicCache(key: string) {
  pendingWrites.delete(key);
  const database = await openDatabase();
  if (!database) return;
  try {
    database.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
  } catch {
    // Cache cleanup is best effort; network data remains authoritative.
  }
}

async function flushWrites() {
  flushScheduled = false;
  if (!pendingWrites.size) return;
  const queued = [...pendingWrites.values()];
  pendingWrites.clear();
  const writes: CacheRecord[] = [];
  let writeBytes = 0;
  for (const item of queued) {
    let serialized: string;
    try {
      serialized = JSON.stringify(item.value);
    } catch {
      continue;
    }
    const bytes = new Blob([serialized]).size;
    if (bytes > MAX_RECORD_BYTES || writeBytes + bytes > MAX_TOTAL_BYTES) continue;
    writeBytes += bytes;
    const now = Date.now();
    writes.push({ key: item.key, value: item.value, savedAt: now, accessedAt: now, bytes });
  }
  if (!writes.length) return;
  const database = await openDatabase();
  if (!database) return;

  try {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const readAll = store.getAll() as IDBRequest<CacheRecord[]>;
    readAll.onsuccess = () => {
      const records = readAll.result || [];
      const replaced = new Set(writes.map((record) => record.key));
      let totalBytes = records.reduce((sum, record) => sum + (replaced.has(record.key) ? 0 : record.bytes), 0);
      totalBytes += writes.reduce((sum, record) => sum + record.bytes, 0);
      for (const record of records) {
        if (Date.now() - record.savedAt > MAX_STALE_MS) {
          store.delete(record.key);
          totalBytes -= record.bytes;
        }
      }
      const evictionCandidates = records
        .filter((record) => !replaced.has(record.key) && Date.now() - record.savedAt <= MAX_STALE_MS)
        .sort((left, right) => left.accessedAt - right.accessedAt);
      for (const record of evictionCandidates) {
        if (totalBytes <= MAX_TOTAL_BYTES) break;
        store.delete(record.key);
        totalBytes -= record.bytes;
      }
      for (const record of writes) store.put(record);
    };
  } catch {
    return;
  }
}
