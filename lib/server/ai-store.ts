// AI 密钥的存储后端。默认使用腾讯云 CloudBase 云存储（PG 模式私有 bucket），
// 设置 AI_SECRET_STORE=blob 可回退到 Vercel Blob。
import { del, get, put } from "@vercel/blob";
import { ApiError } from "@/lib/server/api";

export type AiStore = {
  readonly label: string;
  read(path: string): Promise<string | null>;
  write(path: string, value: string): Promise<void>;
  remove(path: string): Promise<void>;
};

function storeMode() {
  return process.env.AI_SECRET_STORE?.trim().toLowerCase() === "blob" ? "blob" : "cloudbase";
}

function bucketId() {
  return process.env.AI_SECRET_BUCKET?.trim() || "heika-private";
}

// 存储后端选择只在进程内解析一次，避免每次请求重复初始化 SDK。
let resolved: { key: string; store: AiStore } | null = null;

export function aiStore(): AiStore {
  const key = `${storeMode()}:${bucketId()}`;
  if (!resolved || resolved.key !== key) {
    resolved = { key, store: storeMode() === "blob" ? blobStore() : cloudbaseStore() };
  }
  return resolved.store;
}

function cloudbaseStore(): AiStore {
  let opening: Promise<CloudBaseBucket> | null = null;

  async function bucket(): Promise<CloudBaseBucket> {
    if (!opening) {
      opening = (async () => {
        const [appModule, authModule, storageModule] = await Promise.all([
          import("@cloudbase/js-sdk/app"),
          import("@cloudbase/js-sdk/auth"),
          import("@cloudbase/js-sdk/storage"),
        ]);
        const cloudbase = appModule.default;
        authModule.registerAuth(cloudbase);
        storageModule.registerStorage(cloudbase);
        const env = process.env.TCB_ENV_ID?.trim() || process.env.CLOUDBASE_ENV_ID?.trim() || "heika-d6g93evt77a482544";
        // 服务端特权凭证优先；未配置时依赖云托管容器自动注入的默认鉴权。
        const apiKey = process.env.CLOUDBASE_APIKEY?.trim();
        const config = { env, timeout: 20000, ...(apiKey ? { accessKey: apiKey } : {}) };
        const app = cloudbase.init(config as Parameters<typeof cloudbase.init>[0]);
        const storage = (app as unknown as { storage: { from(bucket: string): CloudBaseBucket } }).storage;
        return storage.from(bucketId());
      })().catch((error) => {
        opening = null;
        throw error instanceof ApiError ? error : new ApiError(503, "腾讯云存储初始化失败");
      });
    }
    return opening;
  }

  return {
    label: `cloudbase:${bucketId()}`,
    async read(path) {
      const target = await bucket();
      const result = await target.download(path);
      if (result.error) {
        const failure = result.error as { status?: number; message?: unknown };
        if (failure.status === 404 || /not.?found/i.test(String(failure.message ?? ""))) return null;
        throw new ApiError(503, "读取云端 AI 密钥失败");
      }
      if (!result.data) return null;
      const blob = result.data as Blob;
      return typeof blob.text === "function" ? blob.text() : new Response(blob).text();
    },
    async write(path, value) {
      const target = await bucket();
      const result = await target.upload(path, value, { contentType: "application/json", upsert: true });
      if (result.error) throw new ApiError(503, "保存 AI 密钥到腾讯云存储失败");
    },
    async remove(path) {
      const target = await bucket();
      const result = await target.remove([path]);
      // 对象本来就不存在时按删除成功处理。
      if (result.error) {
        const status = (result.error as { status?: number }).status;
        if (status !== 404) throw new ApiError(503, "删除云端 AI 密钥失败");
      }
    },
  };
}

function blobStore(): AiStore {
  return {
    label: "vercel-blob",
    async read(path) {
      const file = await get(path, { access: "private", useCache: false });
      if (!file) return null;
      return new Response(file.stream).text();
    },
    async write(path, value) {
      await put(path, value, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      });
    },
    async remove(path) {
      await del(path);
    },
  };
}

type CloudBaseBucket = {
  download(path: string): Promise<{ data: unknown; error: unknown }>;
  upload(path: string, body: string, options: { contentType: string; upsert: boolean }): Promise<{ data: unknown; error: unknown }>;
  remove(paths: string[]): Promise<{ data: unknown; error: unknown }>;
};

type CloudBaseSdk = {
  init(options: Record<string, unknown>): { storage: { from(bucket: string): CloudBaseBucket } };
};
