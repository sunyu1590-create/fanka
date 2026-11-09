import type { NextRequest } from "next/server";
import { ApiError, context, dbError } from "@/lib/server/api";

export type StaffRole = "admin" | "content_manager" | "reviewer";
export type StaffPermission =
  | "content.read" | "content.review" | "content.manage"
  | "ai.read" | "ai.review" | "ai.manage" | "category.manage"
  | "reports.manage" | "appeals.manage" | "accounts.manage" | "comments.manage" | "keywords.manage" | "audit.read";

const permissions: Record<StaffRole, ReadonlySet<StaffPermission>> = {
  admin: new Set([
    "content.read", "content.review", "content.manage", "ai.read", "ai.review", "ai.manage",
    "category.manage", "reports.manage", "appeals.manage", "accounts.manage", "comments.manage", "keywords.manage", "audit.read",
  ]),
  content_manager: new Set([
    "content.read", "content.review", "content.manage", "ai.read", "ai.review", "ai.manage",
    "category.manage", "reports.manage", "appeals.manage", "comments.manage", "keywords.manage", "audit.read",
  ]),
  reviewer: new Set(["content.read", "content.review", "ai.read", "ai.review", "reports.manage", "appeals.manage", "comments.manage", "audit.read"]),
};

export function isStaffRole(role: unknown): role is StaffRole {
  return role === "admin" || role === "content_manager" || role === "reviewer";
}

export function roleHasPermission(role: unknown, permission: StaffPermission) {
  return isStaffRole(role) && permissions[role].has(permission);
}

export async function requirePermission(req: NextRequest, permission: StaffPermission) {
  const { db, user } = await context(req);
  const { data: profile, error } = await db.from("profiles").select("id,role,nickname").eq("id", user!.id).single();
  dbError(error);
  if (!profile || !roleHasPermission(profile.role, permission)) throw new ApiError(403, "没有执行此管理操作的权限");
  return { db, user: user!, profile: profile as { id: string; role: StaffRole; nickname: string } };
}
