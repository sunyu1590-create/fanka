import type { NextRequest } from "next/server";
import { ApiError, context, dbError } from "@/lib/server/api";

export async function requireAdmin(req: NextRequest) {
  const { db, user } = await context(req);
  const { data: profile, error } = await db.from("profiles").select("role").eq("id", user!.id).single();
  dbError(error);
  if (profile?.role !== "admin") throw new ApiError(403, "需要管理员权限");
  return { db, user: user! };
}
