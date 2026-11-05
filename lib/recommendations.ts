import type { Post } from "./content";

export type CommunityRating = { average: number; count: number };

export function rankRecommendations(
  posts: Post[],
  interests: string[],
  viewed: number[],
  personalRatings: Record<number, number>,
  communityRatings: Record<number, CommunityRating>,
) {
  const viewedIds = new Set(viewed);
  const personalByTag = new Map<string, { sum: number; count: number }>();
  for (const post of posts) {
    const rating = personalRatings[post.id];
    if (!rating) continue;
    const current = personalByTag.get(post.tag) || { sum: 0, count: 0 };
    current.sum += rating;
    current.count += 1;
    personalByTag.set(post.tag, current);
  }

  const score = (post: Post) => {
    const personal = personalByTag.get(post.tag);
    const personalAverage = personal
      ? (personal.sum + 3 * 2) / (personal.count + 2)
      : 3;
    const community = communityRatings[post.id];
    const communityAverage = community
      ? (community.average * community.count + 3 * 5) / (community.count + 5)
      : 3;
    const timestamp = Date.parse(post.date);
    const ageDays = Number.isFinite(timestamp)
      ? Math.max(0, (Date.now() - timestamp) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    const freshness = Math.max(0, 1 - ageDays / 45) * 0.2;

    return (
      (interests.includes(post.tag) ? 1 : 0) +
      (personalAverage - 3) * 0.55 +
      (communityAverage - 3) * 0.35 +
      freshness -
      (viewedIds.has(post.id) ? 0.28 : 0)
    );
  };

  const baseScores = new Map(posts.map((post) => [post.id, score(post)]));
  const byTopic = new Map<string, Post[]>();
  const byScore = [...posts].sort((a, b) =>
    baseScores.get(b.id)! - baseScores.get(a.id)! ||
    b.date.localeCompare(a.date) || a.id - b.id,
  );
  for (const post of byScore) {
    const topic = byTopic.get(post.tag) || [];
    topic.push(post);
    byTopic.set(post.tag, topic);
  }

  const ranked: Post[] = [];
  const topicCounts = new Map<string, number>();
  let remainingCount = posts.length;
  while (remainingCount) {
    let bestTopic: string | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestId = Number.POSITIVE_INFINITY;
    for (const [topic, candidates] of byTopic) {
      const post = candidates[0];
      if (!post) continue;
      const diversified = baseScores.get(post.id)! - (topicCounts.get(topic) || 0) * 0.18;
      if (diversified > bestScore || (diversified === bestScore && post.id < bestId)) {
        bestTopic = topic;
        bestScore = diversified;
        bestId = post.id;
      }
    }
    if (bestTopic === null) break;
    const next = byTopic.get(bestTopic)!.shift()!;
    remainingCount -= 1;
    ranked.push(next);
    topicCounts.set(next.tag, (topicCounts.get(next.tag) || 0) + 1);
  }
  return ranked;
}
