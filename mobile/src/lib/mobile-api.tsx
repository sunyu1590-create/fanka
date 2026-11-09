import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { NativeModules, Platform } from "react-native";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearUserCache } from "./local-store";

const DEFAULT_API_BASE = "https://moonclean.shop";
export const API_BASE = (() => {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;
  try {
    const parsed = new URL(configured);
    const localDevelopmentHost = ["localhost", "127.0.0.1", "10.0.2.2"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(__DEV__ && localDevelopmentHost)) return DEFAULT_API_BASE;
    return parsed.toString().replace(/\/$/, "");
  } catch { return DEFAULT_API_BASE; }
})();

let clientPromise: Promise<SupabaseClient> | undefined;

type SecureSessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function authStorage(): SecureSessionStorage {
  if (Platform.OS === "android") {
    const secureStorage = NativeModules.HeikaSecureStorage as SecureSessionStorage | undefined;
    if (!secureStorage) throw new Error("安卓安全存储模块不可用，请重新安装正式应用。");
    return secureStorage;
  }
  return AsyncStorage;
}

export function getDb() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch(`${API_BASE}/api/client-config`, { credentials: "omit", redirect: "error" });
      const config = await response.json().catch(() => ({})) as { url?: unknown; key?: unknown };
      if (!response.ok || typeof config.url !== "string" || typeof config.key !== "string") throw new Error("账号服务暂不可用");
      let parsedUrl: URL;
      try { parsedUrl = new URL(config.url); } catch { throw new Error("账号服务配置无效"); }
      if (parsedUrl.protocol !== "https:") throw new Error("账号服务连接不安全");
      const isPublishable = config.key.startsWith("sb_publishable_");
      let isAnonJwt = false;
      if (!isPublishable && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(config.key)) {
        try { isAnonJwt = JSON.parse(globalThis.atob(config.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; }
        catch { isAnonJwt = false; }
      }
      if (!isPublishable && !isAnonJwt) throw new Error("账号服务公钥配置无效");
      return createClient(parsedUrl.toString().replace(/\/$/, ""), config.key, {
        auth: {
          storage: authStorage(),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
    })().catch((error) => { clientPromise = undefined; throw error; });
  }
  return clientPromise;
}

export async function api<T = unknown>(path: string, session?: Session | string | null, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("请求地址无效");
  const target = new URL(path, API_BASE);
  if (target.origin !== new URL(API_BASE).origin) throw new Error("请求地址无效");
  const headers = new Headers(init.headers);
  const token = typeof session === "string" ? session : session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(target.toString(), { ...init, headers, credentials: "omit", redirect: "error" });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: unknown };
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "请求失败，请稍后重试");
  return payload.data as T;
}

export function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useMobileSession() {
  return useContext(SessionContext);
}

type SessionContextValue = { session: Session | null; loading: boolean; refresh: () => Promise<void> };
const SessionContext = createContext<SessionContextValue>({ session: null, loading: true, refresh: async () => undefined });

export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const refresh = async () => {
    const client = await getDb();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    setSession(data.session);
  };
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getDb().then(async (client) => {
      const { data } = await client.auth.getSession();
      if (active) setSession(data.session);
      if (!active) return;
      const listener = client.auth.onAuthStateChange((_event, current) => {
        const previousUser = sessionRef.current?.user.id;
        if (previousUser && previousUser !== current?.user.id) void clearUserCache(previousUser);
        if (active) { sessionRef.current = current; setSession(current); }
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    }).catch(() => {
      if (active) setSession(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const value = useMemo(() => ({ session, loading, refresh }), [session, loading]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
