import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const role = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(role.error);
    if (role.data?.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const query = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (query.length < 2 || query.length > 60) throw new ApiError(400, "请输入 2-60 个字符的作品标题");
    const { data, error } = await db.from("posts")
      .select("id,client_id,title,image_url,profiles!posts_author_id_fkey(nickname)")
      .eq("channel", "community")
      .eq("status", "published")
      .ilike("title", `%${query.replace(/[,%()]/g, " ")}%`)
      .order("created_at", { ascending: false })
      .limit(20);
    dbError(error);
    const rows = (data || []) as unknown as {
      id: string;
      client_id: number;
      title: string;
      image_url: string | null;
      profiles: { nickname: string } | { nickname: string }[] | null;
    }[];
    return { items: rows.map((post) => ({
      id: post.id,
      client_id: post.client_id,
      title: post.title,
      image_url: post.image_url,
      author: Array.isArray(post.profiles) ? post.profiles[0]?.nickname || "探索者" : post.profiles?.nickname || "探索者",
    })) };
  });
}
