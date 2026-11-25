import { browserDb } from "./browser-db";
export async function cloudRequest(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  headers?: Record<string, string>,
) {
  const db = await browserDb();
  const { data } = await db.auth.getSession();
  if (!data.session) return null;
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
      ...headers,
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

/**
 * 公开只读接口：未登录也要能取到公开数据（如合集详情）。
 * cloudRequest 在没有会话时直接返回 null，用它读公开页面会拿到空值，
 * 因此公开读取统一走这里；已登录时仍带上会话，顺带拿到收藏与进度状态。
 */
export async function publicRequest<T = unknown>(path: string): Promise<T> {
  const db = await browserDb();
  const { data } = await db.auth.getSession();
  const headers: HeadersInit = data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  const response = await fetch(path, { cache: "no-store", headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error || "请求失败");
  return (result as { data?: T }).data as T;
}
