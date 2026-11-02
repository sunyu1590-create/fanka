import { randomBytes, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { context, dbError, respond } from "@/lib/server/api";

function digest(code: string) {
  return createHash("sha256").update(code.replace(/[^a-f0-9]/gi, "").toUpperCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req, true);
    if (!user?.email) throw new Error("账号邮箱不可用");
    const db = adminClient();
    const codes = Array.from({ length: 8 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"));
    const { error: deleteError } = await db.from("account_recovery_codes").delete().eq("user_id", user.id);
    dbError(deleteError);
    const { error } = await db.from("account_recovery_codes").insert(codes.map((code) => ({ user_id: user.id, email: user.email!.toLowerCase(), code_hash: digest(code) })));
    dbError(error);
    return { codes };
  });
}
