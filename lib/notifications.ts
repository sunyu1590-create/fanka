export const OFFICIAL_NOTIFICATION_PREFIX = "official:";

export function officialNotificationId(noticeId: string) {
  return `${OFFICIAL_NOTIFICATION_PREFIX}${noticeId}`;
}

export function officialNoticeIdFromNotificationId(id: string) {
  return id.startsWith(OFFICIAL_NOTIFICATION_PREFIX)
    ? id.slice(OFFICIAL_NOTIFICATION_PREFIX.length)
    : null;
}

export function pageMergedNotifications<T extends { created_at: string }>(
  social: T[],
  system: T[],
  page: number,
  limit: number,
) {
  const start = (Math.max(1, page) - 1) * Math.max(1, limit);
  return [...social, ...system]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(start, start + limit);
}
