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
      for (const key of request.result) if (String(key).startsWith(`${owner}:`)) store.delete(key);
      for (const item of files) if (item.file) store.put({ key: `${owner}:${item.id}`, owner, id: item.id, file: item.file } satisfies StoredDraftFile);
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
