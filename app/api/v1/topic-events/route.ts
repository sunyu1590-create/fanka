import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const { data: events, error } = await db.from("topic_events").select("id,title,description,starts_at,ends_at,interest_tags(name)").lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).order("ends_at");
    dbError(error);
    const ids = (events || []).map((event) => event.id);
    if (!ids.length) return { items: [] };
    const [participants, topicRows, joined] = await Promise.all([
      db.from("topic_event_participants").select("event_id,user_id").in("event_id", ids),
      db.from("topic_events").select("id,topic_id").in("id", ids),
      user ? db.from("topic_event_participants").select("event_id").in("event_id", ids).eq("user_id", user.id) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(participants.error); dbError(topicRows.error); dbError(joined.error);
    const topicIds = [...new Set((topicRows.data || []).map((item) => item.topic_id))];
    const { data: links, error: linksError } = topicIds.length ? await db.from("post_topics").select("topic_id,post_id,posts!inner(status)").in("topic_id", topicIds).eq("posts.status", "published") : { data: [], error: null };
    dbError(linksError);
    const counts = new Map<number, number>();
    for (const item of links || []) counts.set(item.topic_id, (counts.get(item.topic_id) || 0) + 1);
    const topicByEvent = new Map((topicRows.data || []).map((item) => [item.id, item.topic_id]));
    const peopleByEvent = new Map<string, number>();
    for (const item of participants.data || []) peopleByEvent.set(item.event_id, (peopleByEvent.get(item.event_id) || 0) + 1);
    const joinedIds = new Set((joined.data || []).map((item) => item.event_id));
    return { items: (events || []).map((event) => {
      const row = event as unknown as { id: string; title: string; description: string; starts_at: string; ends_at: string; interest_tags: { name: string } | { name: string }[] | null };
      return { ...row, topic: Array.isArray(row.interest_tags) ? row.interest_tags[0]?.name : row.interest_tags?.name, postCount: counts.get(topicByEvent.get(row.id) || 0) || 0, participantCount: peopleByEvent.get(row.id) || 0, joined: joinedIds.has(row.id) };
    }) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const eventId = uuid(body.eventId, "活动");
    const { data: event, error: eventError } = await db.from("topic_events").select("id").eq("id", eventId).lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).maybeSingle();
    dbError(eventError);
    if (!event) throw new ApiError(404, "活动已结束");
    const { data: existing, error: readError } = await db.from("topic_event_participants").select("event_id").eq("event_id", eventId).eq("user_id", user!.id).maybeSingle();
    dbError(readError);
    const result = existing ? await db.from("topic_event_participants").delete().eq("event_id", eventId).eq("user_id", user!.id) : await db.from("topic_event_participants").insert({ event_id: eventId, user_id: user!.id });
    dbError(result.error);
    return { joined: !existing };
  });
}
