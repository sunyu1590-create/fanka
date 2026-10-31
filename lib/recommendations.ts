import type { Post } from "./content";

export type CommunityRating = { average: number; count: number };

export function rankRecommendations(
  posts: Post[],
  interests: string[],
  _viewed: number[],
  personalRatings: Record<number, number>,
  communityRatings: Record<number, CommunityRating>,
) {
  // View history is tracked for the reader profile, but opening a post must not
  // reshuffle the current feed under the detail transition.
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

    return (
      (interests.includes(post.tag) ? 1 : 0) +
      (personalAverage - 3) * 0.55 +
      (communityAverage - 3) * 0.35
    );
  };

  return [...posts].sort((a, b) => score(b) - score(a) || a.id - b.id);
}
