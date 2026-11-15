import { CloudBaseAuth } from "./cb-auth";
import { createDbClient, type DbClient } from "./cb-db";

let pending: Promise<DbClient> | undefined;
let configPending: Promise<{ gateway: string }> | undefined;
let authInstance: CloudBaseAuth | undefined;

export function browserDbConfig() {
  return (configPending ??= (async () => {
    const response = await fetch("/api/client-config");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return { gateway: String(data.gateway ?? data.url ?? "").replace(/\/$/, "") };
  })().catch((error) => {
    configPending = undefined;
    throw error;
  }));
}

export async function browserAuth() {
  const config = await browserDbConfig();
  return (authInstance ??= new CloudBaseAuth(config.gateway));
}

export function browserDb() {
  return (pending ??= (async () => {
    const config = await browserDbConfig();
    const auth = (authInstance ??= new CloudBaseAuth(config.gateway));
    return createDbClient(config.gateway, auth);
  })().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
