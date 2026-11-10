import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { explorationDayKey, explorationStreak, localMonthStartUtc } from "@/lib/exploration-calendar";
import { cardRarityTier } from "@/lib/progression";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";

const FALLBACK_TIME_ZONE = "Asia/Shanghai";
type CalendarRow = { post_id: string; opened_at: string };

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("timezone").eq("id", user!.id).single();
    dbError(profileError);
    let timeZone = profile?.timezone || FALLBACK_TIME_ZONE;
    try { new Intl.DateTimeFormat("en", { timeZone }); }
    catch { timeZone = FALLBACK_TIME_ZONE; }

    const monthParam = req.nextUrl.searchParams.get("month");
    const month = monthParam || new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "月份格式无效");
    const [year, monthNumber] = month.split("-").map(Number);
    if (year < 2000 || year > 2100) throw new ApiError(400, "月份超出支持范围");

    const monthStart = localMonthStartUtc(month, timeZone);
    const nextMonth = `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, "0")}`;
    const monthEnd = localMonthStartUtc(nextMonth, timeZone);
    // Supabase/PostgREST may cap a response at 1,000 rows. Page both queries so
    // a prolific account does not silently get an incomplete month or streak.
    const pageSize = 500;
    const monthData: CalendarRow[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from("user_interactions")
        .select("post_id,opened_at")
        .eq("user_id", user!.id)
        .not("opened_at", "is", null)
        .gte("opened_at", monthStart.toISOString())
        .lt("opened_at", monthEnd.toISOString())
        .order("opened_at", { ascending: true })
        .order("post_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      dbError(page.error);
      monthData.push(...((page.data || []) as CalendarRow[]));
      if (!page.data || page.data.length < pageSize) break;
    }

    const openedAt: string[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from("user_interactions").select("opened_at")
        .eq("user_id", user!.id).not("opened_at", "is", null)
        .order("opened_at", { ascending: false })
        .order("post_id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      dbError(page.error);
      openedAt.push(...(page.data || []).flatMap((row) => row.opened_at ? [row.opened_at] : []));
      if (!page.data || page.data.length < pageSize) break;
    }
    const { today, streak } = explorationStreak(openedAt, timeZone);

    const postIds = [...new Set(monthData.map((row) => row.post_id))];
    const postRows = postIds.length
      ? await db.from("posts").select(`${libraryFields},rating_average,rating_count`).in("id", postIds).eq("status", "published")
      : { data: [], error: null };
    dbError(postRows.error);
    const libraryRows = (postRows.data || []) as unknown as Array<LibraryRow & { rating_average: number | null; rating_count: number }>;
    const presentedPosts = await presentMany(db, libraryRows);
    const rawById = new Map(libraryRows.map((post) => [post.id, post]));
    const presentedById = new Map(presentedPosts.map((post) => {
      const raw = rawById.get(post.cloudId);
      const ratingAverage = Number(raw?.rating_average || 0);
      const ratingCount = Number(raw?.rating_count || 0);
      return [post.cloudId, {
        id: post.cloudId,
        clientId: post.id,
        title: post.title,
        tag: post.tag,
        channel: post.channel,
        images: post.images || [],
        coverUrl: post.image || null,
        ratingAverage,
        ratingCount,
        rarityTier: cardRarityTier(ratingAverage, ratingCount),
      }] as const;
    }));

    const records = monthData.flatMap((row) => {
      const post = presentedById.get(row.post_id);
      if (!row.opened_at || !post) return [];
      return [{
        date: explorationDayKey(row.opened_at, timeZone),
        openedAt: row.opened_at,
        post,
      }];
    });
    const days = new Map<string, number>();
    for (const row of monthData) {
      const date = explorationDayKey(row.opened_at, timeZone);
      days.set(date, (days.get(date) || 0) + 1);
    }
    return { month, timeZone, today, streak, total: monthData.length, days: [...days].map(([date, count]) => ({ date, count })), records };
  });
}
