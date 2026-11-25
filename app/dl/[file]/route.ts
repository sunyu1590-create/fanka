import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { requireFeature } from "@/lib/server/feature-flags";

/**
 * 安装包下载出口。
 *
 * 以前 /dl/* 由 Caddy 直接读文件，管理中心的「暂停 APK 下载」只能隐藏按钮，
 * 直链照样能下。这里把下载收回到应用层：先过功能开关，再流式回传文件，
 * 让开关在服务端真正生效。Caddy 侧把 /dl/* 反代到本路由即可。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = "/srv/dl";
const APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.apk$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = decodeURIComponent(file || "");
  if (!APK_NAME.test(name)) return new NextResponse("安装包不存在", { status: 404 });

  try {
    await requireFeature("apk");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "APK 下载当前已暂停";
    return new NextResponse(message, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const path = `${ROOT}/${name}`;
  let size = 0;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return new NextResponse("安装包不存在", { status: 404 });
    size = stat.size;
  } catch {
    return new NextResponse("安装包不存在", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${name}"`,
      // APK 大小会变，交给客户端按需校验，不做长缓存。
      "cache-control": "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function HEAD(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = decodeURIComponent(file || "");
  if (!APK_NAME.test(name)) return new NextResponse(null, { status: 404 });
  try {
    await requireFeature("apk");
    const stat = statSync(`${ROOT}/${name}`);
    if (!stat.isFile()) return new NextResponse(null, { status: 404 });
    return new NextResponse(null, {
      status: 200,
      headers: {
        "content-type": "application/vnd.android.package-archive",
        "content-length": String(stat.size),
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
