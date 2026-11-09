import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let pending: Promise<SupabaseClient> | undefined;
let configPending: Promise<{ url: string; key: string }> | undefined;

export function browserDbConfig() {
  return (configPending ??= (async () => {
    const response = await fetch("/api/client-config");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return { url: data.url as string, key: data.key as string };
  })().catch((error) => {
    configPending = undefined;
    throw error;
  }));
}

export function browserDb() {
  return (pending ??= (async () => {
    const config = await browserDbConfig();
    return createClient(config.url, config.key);
  })().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
