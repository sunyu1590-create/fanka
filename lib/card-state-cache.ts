const DATABASE = "heika-opened-card-state-v1";
const STORE = "snapshots";
const SCHEMA_VERSION = 1;
const FALLBACK_PREFIX = "heika-card-state-fallback-v1:";

type SnapshotRecord<T = unknown> = {
  key: string;
  version: number;
  updatedAt: number;
  value: T;
};

let databasePromise: Promise<IDBDatabase | null> | undefined;
const writes = new Map<string, Promise<boolean>>();

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
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

function readRecord<T>(database: IDBDatabase, key: string) {
  return new Promise<SnapshotRecord<T> | null>((resolve) => {
    try {
      const request = database.transaction(STORE, "readonly").objectStore(STORE)
        .get(key) as IDBRequest<SnapshotRecord<T> | undefined>;
      request.onsuccess = () => {
        const record = request.result;
        resolve(record?.version === SCHEMA_VERSION ? record : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeRecord<T>(database: IDBDatabase, key: string, value: T, updatedAt = Date.now()) {
  return new Promise<boolean>((resolve) => {
    try {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({
        key,
        version: SCHEMA_VERSION,
        updatedAt,
        value,
      } satisfies SnapshotRecord<T>);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Loads a durable account-scoped snapshot and migrates the former localStorage value. */
export async function loadCardStateSnapshot<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  const record = database ? await readRecord<T>(database, key) : null;
  let fallback: SnapshotRecord<T> | null = null;
  try {
    const rawFallback = localStorage.getItem(`${FALLBACK_PREFIX}${key}`);
    if (rawFallback) {
      const parsed = JSON.parse(rawFallback) as SnapshotRecord<T>;
      if (parsed.version === SCHEMA_VERSION && Number.isFinite(parsed.updatedAt) && "value" in parsed) {
        fallback = parsed;
      }
    }
  } catch {
    // Ignore a damaged fallback; the primary IndexedDB value remains available.
  }
  if (fallback && (!record || fallback.updatedAt > record.updatedAt)) {
    if (database && await writeRecord(database, key, fallback.value, fallback.updatedAt)) {
      try { localStorage.removeItem(`${FALLBACK_PREFIX}${key}`); } catch { /* Best effort. */ }
    }
    return fallback.value;
  }
  if (record) return record.value;

  let legacyValue: T | null = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) legacyValue = JSON.parse(raw) as T;
  } catch {
    // Keep a malformed legacy entry untouched so a failed migration never destroys it.
  }
  if (legacyValue === null) return null;

  if (database && await writeRecord(database, key, legacyValue)) {
    try { localStorage.removeItem(key); } catch { /* IndexedDB is already authoritative. */ }
  }
  return legacyValue;
}

/** Serializes writes per account so an older React commit cannot replace a newer snapshot. */
export function saveCardStateSnapshot<T>(key: string, value: T): Promise<boolean> {
  const prior = writes.get(key) || Promise.resolve(true);
  const next = prior.catch(() => false).then(async () => {
    const database = await openDatabase();
    const updatedAt = Date.now();
    if (database) {
      if (await writeRecord(database, key, value, updatedAt)) {
        try {
          localStorage.removeItem(key);
          localStorage.removeItem(`${FALLBACK_PREFIX}${key}`);
        } catch { /* The durable copy is already saved. */ }
        return true;
      }
      try {
        localStorage.setItem(`${FALLBACK_PREFIX}${key}`, JSON.stringify({
          key,
          version: SCHEMA_VERSION,
          updatedAt,
          value,
        } satisfies SnapshotRecord<T>));
        return true;
      } catch {
        return false;
      }
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  });
  writes.set(key, next);
  void next.finally(() => {
    if (writes.get(key) === next) writes.delete(key);
  });
  return next;
}

export async function deleteCardStateSnapshot(key: string) {
  const pending = writes.get(key);
  if (pending) await pending.catch(() => false);
  const database = await openDatabase();
  if (database) {
    try {
      await new Promise<void>((resolve) => {
        const transaction = database.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).delete(key);
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
      });
    } catch { /* The legacy fallback is removed below. */ }
  }
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${FALLBACK_PREFIX}${key}`);
  } catch { /* Best effort on restricted storage. */ }
}

