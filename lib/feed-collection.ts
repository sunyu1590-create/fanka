/** Append page results without rescanning the accumulated feed for every row. */
export function appendUniqueById<T extends { id: number }>(current: T[], incoming: T[]): T[] {
  if (!incoming.length) return current;

  const seen = new Set(current.map((item) => item.id));
  const appended: T[] = [];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    appended.push(item);
  }

  return appended.length ? [...current, ...appended] : current;
}
