import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "https://moonclean.shop";

let clientPromise: Promise<SupabaseClient> | undefined;

export function getDb() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch(`${API_BASE}/api/client-config`);
      const config = await response.json();
      if (!response.ok || !config.url || !config.key) throw new Error("账号服务暂不可用");
      return createClient(config.url, config.key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
    })();
  }
  return clientPromise;
}

export async function api<T = unknown>(path: string, session?: Session | string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = typeof session === "string" ? session : session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败，请稍后重试");
  return payload.data as T;
}

export function makeUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    return (character === "x" ? random : (random & 3 | 8)).toString(16);
  });
}

export function useMobileSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getDb().then(async (client) => {
      const { data } = await client.auth.getSession();
      if (active) setSession(data.session);
      if (!active) return;
      const listener = client.auth.onAuthStateChange((_event, current) => {
        if (active) setSession(current);
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
  return { session, loading };
}
