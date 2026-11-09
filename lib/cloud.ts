import { browserDb } from "./browser-db";
export async function cloudRequest(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const db = await browserDb();
  const { data } = await db.auth.getSession();
  if (!data.session) return null;
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "云端请求失败");
  return result.data;
}

export async function cloudFetch(path: string, init: RequestInit = {}) {
  const db = await browserDb();
  const { data } = await db.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(path, { ...init, headers });
}
