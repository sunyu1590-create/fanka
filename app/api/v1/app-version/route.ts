import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { respond } from "@/lib/server/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 原生客户端启动时读取的版本信息。数据来自安装包目录里的 manifest.json，
 * 与下载页同源，发版脚本写好清单后这里自动同步。
 */
export async function GET(_req: NextRequest) {
  return respond(async () => {
    try {
      const raw = await readFile("/srv/dl/manifest.json", "utf8");
      const manifest = JSON.parse(raw) as {
        native?: { version?: string; code?: number; size?: number; min_sdk?: number; notes?: string[]; updated?: string; file?: string };
        updated_at?: string;
      };
      const native = manifest.native;
      if (!native?.code) return null;
      return {
        version: native.version || "",
        code: native.code,
        size: native.size || 0,
        min_sdk: native.min_sdk || 0,
        updated: native.updated || manifest.updated_at || null,
        notes: native.notes || [],
        page: "https://moonclean.shop/download",
        apk: native.file ? `https://moonclean.shop/dl/${native.file}` : null,
      };
    } catch {
      return null;
    }
  });
}
