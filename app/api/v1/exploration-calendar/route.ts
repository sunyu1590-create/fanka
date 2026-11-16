import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";

const TIME_ZONE = "Asia/Shanghai";

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function shiftDays(date: Date, amount: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

/** 原生客户端的探索日历：每日翻卡次数、当月记录与连续天数。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const me = user!.id;
    const now = new Date();
    const today = localDate(now.toISOString());
    const requested = req.nextUrl.searchParams.get("month");
    const month = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested! : today.slice(0, 7);

    const { data, error } = await db
      .from("user_interactions")
      .select("post_id,opened_at")
      .eq("user_id", me)
      .not("opened_at", "is", null)
      .order("opened_at", { ascending: false })
      .limit(2000);
    dbError(error);

    const rows = (data ?? []) as { post_id: string; opened_at: string }[];
    const openedDays = new Set(rows.map((row) => localDate(row.opened_at)));

    let streak = 0;
    let cursor = now;
    if (!openedDays.has(today)) cursor = shiftDays(now, -1);
    while (openedDays.has(localDate(cursor.toISOString()))) {
      streak += 1;
      cursor = shiftDays(cursor, -1);
    }

    const monthly = rows.filter((row) => localDate(row.opened_at).startsWith(month));
    const counts = new Map<string, number>();
    for (const row of monthly) {
      const date = localDate(row.opened_at);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }

    const ids = [...new Set(monthly.map((row) => row.post_id))];
    const presentById = new Map<string, Record<string, unknown>>();
    if (ids.length) {
      const result = await db.from("posts").select(libraryFields).in("id", ids);
      dbError(result.error);
      const items = await presentMany(db, (result.data ?? []) as unknown as LibraryRow[]);
      for (const item of items) {
        presentById.set(String(item.cloudId), item as unknown as Record<string, unknown>);
      }
    }

    const records = monthly.flatMap((row) => {
      const post = presentById.get(row.post_id);
      if (!post) return [];
      return [{ date: localDate(row.opened_at), openedAt: row.opened_at, post }];
    });

    return {
      month,
      timeZone: TIME_ZONE,
      today,
      streak,
      days: [...counts].map(([date, count]) => ({ date, count })),
      records,
      total: records.length
    };
  });
}
