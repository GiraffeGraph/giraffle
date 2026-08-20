export const MINUTES_PER_DAY = 24 * 60;
export const SNAP_MINUTES = 15;
export const DEFAULT_DURATION_MINUTES = 30;

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
export function parseDue(due: string | null): { day: string; minutes: number | null } | null {
  if (!due) return null;

  const day = due.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const time = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(due);
  if (!time) return { day, minutes: null };

  const minutes = Number(time[1]) * 60 + Number(time[2]);
  return { day, minutes: clampMinutes(minutes) };
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

/** Minutes since midnight for right now, used by the current-time line. */
export function minutesNow(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
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
