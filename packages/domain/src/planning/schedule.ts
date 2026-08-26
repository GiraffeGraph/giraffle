export const MINUTES_PER_DAY = 24 * 60;
export const SNAP_MINUTES = 15;

/** Local calendar day of a date, as the `YYYY-MM-DD` prefix stored in dueDate. */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}

/** Weeks start on Monday, so a week grid ends on the weekend it belongs to. */
export function startOfWeek(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  return addDays(day, -((date.getDay() + 6) % 7));
}

export function addMonths(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return dayKey(date);
}

/** Moves an event by whole months while preserving its day where possible. */
export function addMonthsClamped(day: string, offset: number): string {
  const source = new Date(`${day}T12:00:00`);
  const targetMonth = new Date(source.getFullYear(), source.getMonth() + offset, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 12).getDate();
  targetMonth.setDate(Math.min(source.getDate(), lastDay));
  return dayKey(targetMonth);
}

/** The six full weeks a month grid draws, including the days either side of it. */
export function monthCells(day: string): string[] {
  const start = startOfWeek(`${day.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/**
 * A due date is either a bare day (`2026-08-05`) or a day with a local time
 * (`2026-08-05T09:30`). Minutes are null for the bare form, which the grid
 * shows in its all-day strip.
 */
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dayKey(date) === value;
}

export function parseDue(due: string | null): { day: string; minutes: number | null } | null {
  if (!due) return null;

  const bare = /^(\d{4}-\d{2}-\d{2})$/.exec(due);
  if (bare?.[1] && isDayKey(bare[1])) return { day: bare[1], minutes: null };

  const timed = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(due);
  if (!timed?.[1] || !isDayKey(timed[1])) return null;
  const hours = Number(timed[2]);
  const minutes = Number(timed[3]);
  if (hours > 23 || minutes > 59) return null;
  return { day: timed[1], minutes: hours * 60 + minutes };
}

export function formatDue(day: string, minutes: number | null): string {
  if (minutes === null) return day;

  const snapped = clampMinutes(minutes);
  const hours = String(Math.floor(snapped / 60)).padStart(2, "0");
  const rest = String(snapped % 60).padStart(2, "0");
  return `${day}T${hours}:${rest}`;
}

export function clampMinutes(minutes: number): number {
  return Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY - SNAP_MINUTES);
}

export function snapMinutes(minutes: number): number {
  return clampMinutes(Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
}

export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/**
 * Scheduled pages bucketed by the calendar day they land on, each bucket in
 * clock order. Anything without a due date is not on the calendar at all.
 */
export function groupPagesByDay<T extends { scheduledAt: string | null }>(pages: readonly T[]): Map<string, T[]> {
  const days = new Map<string, T[]>();

  for (const page of pages) {
    const due = parseDue(page.scheduledAt)?.day;
    if (!due) continue;

    const bucket = days.get(due);
    if (bucket) bucket.push(page);
    else days.set(due, [page]);
  }

  for (const bucket of days.values()) {
    bucket.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  }

  return days;
}
