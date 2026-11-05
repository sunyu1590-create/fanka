"use client";

type StoredDraftFile = { key: string; owner: string; id: string; file: File };
const databaseName = "heika-content-drafts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraftFiles(owner: string, files: Array<{ id: string; file?: File }>) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const existing = new Set(request.result.map(String));
      const desired = new Set(files.filter((item) => item.file).map((item) => `${owner}:${item.id}`));
      for (const key of existing) if (key.startsWith(`${owner}:`) && !desired.has(key)) store.delete(key);
      for (const item of files) {
        const key = `${owner}:${item.id}`;
        // File IDs are immutable within a draft, so keep the existing IndexedDB value.
        // This avoids rewriting a large video for every autosave while the user types.
        if (item.file && !existing.has(key)) store.put({ key, owner, id: item.id, file: item.file } satisfies StoredDraftFile);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDraftFiles(owner: string) {
  const db = await openDatabase();
  const values = await new Promise<StoredDraftFile[]>((resolve, reject) => {
    const request = db.transaction("files", "readonly").objectStore("files").getAll();
    request.onsuccess = () => resolve((request.result as StoredDraftFile[]).filter((item) => item.owner === owner));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return values;
}

export async function clearDraftFiles(owner: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    const request = store.getAllKeys();
    request.onsuccess = () => { for (const key of request.result) if (String(key).startsWith(`${owner}:`)) store.delete(key); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
