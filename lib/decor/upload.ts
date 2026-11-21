"use client";

import { browserDb } from "@/lib/browser-db";

/** 上传二进制资源：cloudRequest 只处理 JSON，这里单独走 FormData。 */
export async function uploadDecorAsset(file: File, kind: "icon" | "card-back" | "content-image" | "publish-icon"): Promise<{ url: string; path: string }> {
  const db = await browserDb();
  const { data } = await db.auth.getSession();
  if (!data.session) throw new Error("登录后才能上传资源");
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  const response = await fetch("/api/v1/decor/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error || "上传失败，请重试");
  const url = (payload as { data?: { url?: string } }).data?.url;
  if (!url) throw new Error("上传未完成，请重试");
  return { url, path: (payload as { data?: { path?: string } }).data?.path || "" };
}
