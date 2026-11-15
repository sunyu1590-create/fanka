export function explorationDayKey(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function localMonthStartUtc(month: string, timeZone: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid year-month");
  const [year, monthNumber] = month.split("-").map(Number);
  const desired = Date.UTC(year, monthNumber - 1, 1);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const next = desired - (representedAsUtc - guess);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function previousDateKey(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function explorationStreak(openedAt: Array<string | Date>, timeZone: string, now = new Date()): { today: string; streak: number } {
  const dates = new Set(openedAt.map((value) => explorationDayKey(value, timeZone)));
  const today = explorationDayKey(now, timeZone);
  let cursor = dates.has(today) ? today : previousDateKey(today);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = previousDateKey(cursor);
  }
  return { today, streak };
}
