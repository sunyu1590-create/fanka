import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

const CACHE_PREFIX = "heika:native-cache:v1:";
const CLEARABLE_PUBLIC_CACHE_PREFIX = CACHE_PREFIX + "feed:";
const MAX_DISCOVERY_CACHE_ENTRIES = 12;
const DRAFT_PREFIX = "heika:draft:v1:";
const DRAFT_INDEX_PREFIX = "heika:draft-index:v1:";
const OUTBOX_PREFIX = "heika:outbox:v1:";
type SecureStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
const secureStorage = () => Platform.OS === "android" ? NativeModules.HeikaSecureStorage as SecureStorage | undefined : undefined;

type CachedValue<T> = { savedAt: number; value: T };
const utf8Bytes = (value: string) => {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
};

export type TransientCacheStats = { entries: number; bytes: number };
export async function getTransientCacheStats(): Promise<TransientCacheStats> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CLEARABLE_PUBLIC_CACHE_PREFIX));
  const values = keys.length ? await AsyncStorage.multiGet(keys) : [];
  return { entries: values.filter(([, value]) => value !== null).length, bytes: values.reduce((sum, [, value]) => sum + (value ? utf8Bytes(value) : 0), 0) };
}

/** Removes only the public discovery feed cache; all account-scoped and local user data is preserved. */
export async function clearTransientCache(): Promise<TransientCacheStats> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CLEARABLE_PUBLIC_CACHE_PREFIX));
  const values = keys.length ? await AsyncStorage.multiGet(keys) : [];
  const removed = { entries: values.filter(([, value]) => value !== null).length, bytes: values.reduce((sum, [, value]) => sum + (value ? utf8Bytes(value) : 0), 0) };
  if (keys.length) await AsyncStorage.multiRemove(keys);
  const remaining = await getTransientCacheStats();
  if (remaining.entries > 0) throw new Error("部分临时缓存未能清除，请重试");
  return removed;
}

export async function readCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValue<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.value;
  } catch { return null; }
}

export async function writeCache<T>(key: string, value: T) {
  try { await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ savedAt: Date.now(), value } satisfies CachedValue<T>)); }
  catch { /* Storage pressure must not block feed reads or writes. */ }
}

/** Stores one compact first-page snapshot and bounds the number of discovery snapshots retained. */
export async function writeDiscoveryCache<T>(key: string, value: T) {
  const storageKey = `${CLEARABLE_PUBLIC_CACHE_PREFIX}discover:${key}`;
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), value } satisfies CachedValue<T>));
    const keys = (await AsyncStorage.getAllKeys()).filter((item) => item.startsWith(`${CLEARABLE_PUBLIC_CACHE_PREFIX}discover:`));
    if (keys.length <= MAX_DISCOVERY_CACHE_ENTRIES) return;
    const entries = await AsyncStorage.multiGet(keys);
    const ordered = entries
      .map(([item, raw]) => {
        try { return { key: item, savedAt: raw ? (JSON.parse(raw) as CachedValue<unknown>).savedAt : 0 }; }
        catch { return { key: item, savedAt: 0 }; }
      })
      .sort((a, b) => b.savedAt - a.savedAt);
    await AsyncStorage.multiRemove(ordered.slice(MAX_DISCOVERY_CACHE_ENTRIES).map((item) => item.key));
  } catch { /* Storage pressure must not block feed reads or writes. */ }
}

export type LocalDraft = {
  title: string; body: string; tag: string; topics: string[]; imageUris: string[];
  media?: Array<{ uri: string; id: string; type: string; name: string; path?: string }>;
  coverImageId?: string;
  updatedAt: number;
};

const draftKey = (userId: string, draftId?: string) => `${DRAFT_PREFIX}${userId}${draftId ? `:${draftId}` : ""}`;
const readDraftKeys = (userId: string, raw: string | null) => {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string" && (key === `${DRAFT_PREFIX}${userId}` || key.startsWith(`${DRAFT_PREFIX}${userId}:`))) : [];
  } catch { return []; }
};

export async function readDraft(userId: string, draftId?: string): Promise<LocalDraft | null> {
  try {
    const key = draftKey(userId, draftId);
    const store = secureStorage();
    if (Platform.OS === "android" && !store) return null;
    let value = store ? await store.getItem(key) : await AsyncStorage.getItem(key);
    if (store && !value) {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy) { await store.setItem(key, legacy); await AsyncStorage.removeItem(key); value = legacy; }
    }
    return value ? JSON.parse(value) as LocalDraft : null;
  } catch { return null; }
}

export async function writeDraft(userId: string, draft: LocalDraft, draftId?: string) {
  const key = draftKey(userId, draftId);
  const value = JSON.stringify({ ...draft, updatedAt: Date.now() });
  const store = secureStorage();
  if (Platform.OS === "android" && !store) throw new Error("安全草稿存储模块不可用，请重新安装正式应用。");
  if (store) await store.setItem(key, value);
  else await AsyncStorage.setItem(key, value);
  const indexKey = `${DRAFT_INDEX_PREFIX}${userId}`;
  const known = await AsyncStorage.getItem(indexKey).catch(() => null);
  const keys = readDraftKeys(userId, known);
  if (!keys.includes(key)) await AsyncStorage.setItem(indexKey, JSON.stringify([...keys, key]));
}

export async function clearDraft(userId: string, draftId?: string) {
  const key = draftKey(userId, draftId);
  const store = secureStorage();
  if (store) await store.removeItem(key);
  else await AsyncStorage.removeItem(key);
  const indexKey = `${DRAFT_INDEX_PREFIX}${userId}`;
  const known = await AsyncStorage.getItem(indexKey).catch(() => null);
  const keys = readDraftKeys(userId, known);
  if (keys.length) {
    const next = keys.filter((item) => item !== key);
    if (next.length) await AsyncStorage.setItem(indexKey, JSON.stringify(next));
    else await AsyncStorage.removeItem(indexKey);
  }
}

export type OutboxItem = { id: string; kind: "comment" | "message"; resourceId: string; body: string; createdAt: number };
export async function enqueue(userId: string, item: OutboxItem) {
  const key = `${OUTBOX_PREFIX}${userId}`;
  const queue = await readOutbox(userId);
  if (!queue.some((entry) => entry.id === item.id)) await AsyncStorage.setItem(key, JSON.stringify([...queue, item]));
}
export async function readOutbox(userId: string): Promise<OutboxItem[]> {
  try { const value = await AsyncStorage.getItem(`${OUTBOX_PREFIX}${userId}`); return value ? JSON.parse(value) as OutboxItem[] : []; }
  catch { return []; }
}
export async function removeOutboxItem(userId: string, id: string) {
  const key = `${OUTBOX_PREFIX}${userId}`;
  const queue = await readOutbox(userId);
  await AsyncStorage.setItem(key, JSON.stringify(queue.filter((item) => item.id !== id)));
}

export async function clearUserCache(userId: string) {
  const keys = await AsyncStorage.getAllKeys();
  const scoped = `:${userId}`;
  const privateKeys = keys.filter((key) => key.startsWith(`${DRAFT_PREFIX}${userId}`) || key.startsWith(`${OUTBOX_PREFIX}${userId}`) || key.includes(`${scoped}:`) || key.endsWith(scoped) || key === `${DRAFT_INDEX_PREFIX}${userId}`);
  const draftIndex = await AsyncStorage.getItem(`${DRAFT_INDEX_PREFIX}${userId}`).catch(() => null);
  const secureDraftKeys = readDraftKeys(userId, draftIndex);
  if (!secureDraftKeys.includes(`${DRAFT_PREFIX}${userId}`)) secureDraftKeys.push(`${DRAFT_PREFIX}${userId}`);
  if (privateKeys.length) await AsyncStorage.multiRemove(privateKeys);
  const store = secureStorage();
  if (store) await Promise.all(secureDraftKeys.map((key) => store.removeItem(key).catch(() => undefined)));
}
