import { NextResponse } from "next/server";
import { config } from "@/lib/server/api";

function isPublicSupabaseKey(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_") || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "anon";
  } catch { return false; }
}

export async function GET() {
  try {
    const { url, key } = config();
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" || !isPublicSupabaseKey(key)) throw new Error("invalid public Supabase configuration");
    return NextResponse.json({ url: parsedUrl.toString().replace(/\/$/, ""), key }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "账户服务暂不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
