import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField } from "@/lib/server/api";

const attributes = ["gender", "mbti", "birthday", "hobbies"] as const;
type Attribute = (typeof attributes)[number];
type AttributeValue = { attribute: Attribute; value: string; is_public: boolean };
const mbtiTypes = new Set(["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"]);

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const [profile, interests, bookmarks, details] = await Promise.all([
      db.from("profiles").select("id,nickname,bio,timezone,avatar_url").eq("id", user!.id).single(),
      db.from("user_interests").select("tag_id").eq("user_id", user!.id),
      db.from("bookmarks").select("post_id,created_at").eq("user_id", user!.id),
      db.from("profile_attributes").select("attribute,value,is_public").eq("user_id", user!.id),
    ]);
    for (const result of [profile, interests, bookmarks, details]) dbError(result.error);
    return { profile: profile.data, details: details.data, interests: interests.data, bookmarks: bookmarks.data };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const values: Record<string, string | null> = {};
    if (body.nickname !== undefined) values.nickname = textField(body.nickname, "昵称", 1, 24);
    if (body.bio !== undefined) values.bio = textField(body.bio, "简介", 0, 80);
    if (body.avatar_url !== undefined) values.avatar_url = body.avatar_url === null ? null : textField(body.avatar_url, "头像地址", 1, 2048);
    if (body.timezone !== undefined) {
      const zone = textField(body.timezone, "时区", 1, 64);
      try { new Intl.DateTimeFormat("en", { timeZone: zone }); }
      catch { throw new ApiError(400, "时区无效"); }
      values.timezone = zone;
    }

    let profile: unknown = null;
    if (Object.keys(values).length) {
      const result = await db.from("profiles").update(values).eq("id", user!.id).select("id,nickname,bio,timezone,avatar_url").single();
      dbError(result.error);
      profile = result.data;
    }

    if (Array.isArray(body.details)) {
      const incoming = body.details as Array<Record<string, unknown>>;
      const byName = new Map(incoming.map((item) => [item.attribute, item]));
      const rows: AttributeValue[] = attributes.map((attribute) => {
        const item = byName.get(attribute) || {};
        if (typeof item.is_public !== "boolean") throw new ApiError(400, "资料公开选项无效");
        let value = "";
        if (attribute === "hobbies") {
          if (!Array.isArray(item.value) || item.value.length > 8 || item.value.some((hobby) => typeof hobby !== "string" || hobby.trim().length > 20)) throw new ApiError(400, "爱好最多选择 8 项，每项不超过 20 字");
          const hobbies = [...new Set((item.value as string[]).map((hobby) => hobby.trim()).filter(Boolean))];
          value = JSON.stringify(hobbies);
          if (value.length > 300) throw new ApiError(400, "爱好内容过长");
        } else {
          value = typeof item.value === "string" ? item.value.trim() : "";
          if (value.length > (attribute === "birthday" ? 10 : 24)) throw new ApiError(400, "个人资料长度超出限制");
        }
        if (attribute === "gender" && value && !["female", "male", "nonbinary", "undisclosed"].includes(value)) throw new ApiError(400, "性别选项无效");
        if (attribute === "mbti" && value && !mbtiTypes.has(value.toUpperCase())) throw new ApiError(400, "MBTI 类型无效");
        if (attribute === "birthday" && value) {
          const date = new Date(`${value}T00:00:00.000Z`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10)) throw new ApiError(400, "生日日期无效");
        }
        return { attribute, value, is_public: item.is_public };
      });
      const result = await db.from("profile_attributes").upsert(rows.map((row) => ({ ...row, user_id: user!.id, updated_at: new Date().toISOString() })), { onConflict: "user_id,attribute" });
      dbError(result.error);
    }

    return profile;
  });
}
