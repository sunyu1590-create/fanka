import { ApiError } from "@/lib/server/api";

/**
 * 全局业务开关：维护模式与单项功能启停。
 * 读取 system_flags（service role，5 秒缓存），由业务接口在服务端强制执行，
 * 不依赖前端隐藏入口。
 */

export type FeatureName = "register" | "publish" | "comment" | "dm" | "upload" | "download" | "ai" | "apk";
type Flags = { mode: "normal" | "readonly" | "eco" | "maintenance"; features: Record<FeatureName, boolean> };

const DEFAULT: Flags = {
  mode: "normal",
  features: { register: true, publish: true, comment: true, dm: true, upload: true, download: true, ai: true, apk: true },
};

type Cache = { at: number; value: Flags };
const holder = globalThis as unknown as { __heikaFlags?: Cache };
if (!holder.__heikaFlags) holder.__heikaFlags = { at: 0, value: DEFAULT };

const MODE_BLOCKS: Record<string, FeatureName[]> = {
  readonly: ["publish", "comment", "dm", "upload", "ai"],
  eco: ["ai"],
  maintenance: ["register", "publish", "comment", "dm", "upload", "download", "ai", "apk"],
};

export async function getFlags(): Promise<Flags> {
  const cache = holder.__heikaFlags!;
  if (Date.now() - cache.at < 5000) return cache.value;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return cache.value;
  try {
    const response = await fetch(`${url}/rest/v1/system_flags?select=key,value`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!response.ok) return cache.value;
    const rows = (await response.json()) as Array<{ key: string; value: unknown }>;
    const mode = (rows.find((row) => row.key === "site_mode")?.value as { mode?: string } | undefined)?.mode;
    const features = (rows.find((row) => row.key === "features")?.value as Record<string, boolean> | undefined) || {};
    const value: Flags = {
      mode: (["normal", "readonly", "eco", "maintenance"].includes(String(mode)) ? mode : "normal") as Flags["mode"],
      features: { ...DEFAULT.features, ...features },
    };
    holder.__heikaFlags = { at: Date.now(), value };
    return value;
  } catch {
    return cache.value;
  }
}

/** 业务接口入口调用；关闭时抛出 503，并给出明确原因。 */
export async function requireFeature(name: FeatureName) {
  const flags = await getFlags();
  const blockedByMode = MODE_BLOCKS[flags.mode]?.includes(name);
  if (blockedByMode || flags.features[name] === false) {
    const label: Record<FeatureName, string> = {
      register: "注册", publish: "内容发布", comment: "评论", dm: "私信",
      upload: "上传", download: "下载", ai: "AI 功能", apk: "APK 下载",
    };
    throw new ApiError(503, `${label[name]}当前已暂停${flags.mode === "maintenance" ? "（全站维护中）" : ""}`);
  }
}
