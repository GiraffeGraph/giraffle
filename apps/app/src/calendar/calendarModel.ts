import {
  addDays,
  addMonthsClamped,
  dayKey,
  formatDue,
  parseDue,
  snapMinutes,
  type Page,
  type PagePriority,
  type PageState,
} from "@giraffle/domain";

export type CalendarMode = "day" | "week" | "month";

export interface TimedPlacement {
  page: Page;
  start: number;
  end: number;
  column: number;
  columns: number;
}

export interface CalendarFilters {
  showCompleted: boolean;
  priorities: ReadonlySet<PagePriority>;
  stateIds: ReadonlySet<string>;
}

export function calendarPages(
  pages: readonly Page[],
  states: readonly PageState[],
  filters?: CalendarFilters,
): Page[] {
  const family = new Map(states.map((state) => [state.id, state.family]));
  return pages
    .filter((page) => {
      if (page.isArchived || !parseDue(page.scheduledAt)) return false;
      if (!filters) return true;
      if (!filters.showCompleted && family.get(page.stateId) === "done") return false;
      if (filters.priorities.size && (!page.priority || !filters.priorities.has(page.priority))) {
        return false;
      }
      return !filters.stateIds.size || filters.stateIds.has(page.stateId);
    })
    .sort(
      (left, right) =>
        (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? "") ||
        left.position.localeCompare(right.position),
    );
}

export function pagesOnDay(pages: readonly Page[], day: string) {
  const allDay: Page[] = [];
  const timed: Page[] = [];
  for (const page of pages) {
    const due = parseDue(page.scheduledAt);
    if (due?.day !== day) continue;
    if (due.minutes === null) allDay.push(page);
    else timed.push(page);
  }
  return { allDay, timed };
}

/** Assigns overlapping events to stable side-by-side lanes. */
export function layoutTimedPages(pages: readonly Page[]): TimedPlacement[] {
  const ordered = pages
    .map((page) => {
      const due = parseDue(page.scheduledAt);
      if (!due || due.minutes === null) return null;
      const duration = Math.max(15, page.durationMinutes ?? 30);
      return { page, start: due.minutes, end: Math.min(24 * 60, due.minutes + duration) };
    })
    .filter((item): item is Omit<TimedPlacement, "column" | "columns"> => item !== null)
    .sort(
      (left, right) =>
        left.start - right.start || right.end - left.end || left.page.position.localeCompare(right.page.position),
    );

  const result: TimedPlacement[] = [];
  let cluster: typeof ordered = [];
  let clusterEnd = -1;

  const placeCluster = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placed = cluster.map((item) => {
      let column = laneEnds.findIndex((end) => end <= item.start);
      if (column < 0) {
        column = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[column] = item.end;
      }
      return { ...item, column };
    });
    const columns = Math.max(1, laneEnds.length);
    result.push(...placed.map((item) => ({ ...item, columns })));
  };

  for (const item of ordered) {
    if (cluster.length && item.start >= clusterEnd) {
      placeCluster();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  placeCluster();
  return result;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export interface QuickSchedule {
  title: string;
  day: string;
  minutes: number | null;
  durationMinutes: number;
}

/** Small, deterministic local parser for capture text; no content leaves the device. */
export function parseQuickSchedule(input: string, now = new Date()): QuickSchedule {
  let title = input.trim();
  let day = dayKey(now);
  let minutes: number | null = null;
  let durationMinutes = 30;

  const duration = /\bfor\s+(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\b/i.exec(title);
  if (duration && (duration[1] || duration[2])) {
    durationMinutes = Math.max(15, Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0));
    title = title.replace(duration[0], " ");
  }

  const explicitDay = /\b(\d{4}-\d{2}-\d{2})\b/.exec(title);
  if (explicitDay && parseDue(explicitDay[1] ?? null)) {
    day = explicitDay[1] as string;
    title = title.replace(explicitDay[0], " ");
  } else if (/\btomorrow\b/i.test(title)) {
    day = addDays(dayKey(now), 1);
    title = title.replace(/\btomorrow\b/i, " ");
  } else if (/\btoday\b/i.test(title)) {
    title = title.replace(/\btoday\b/i, " ");
  } else {
    const weekday = /\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(title);
    if (weekday?.[1]) {
      const target = WEEKDAYS.indexOf(weekday[1].toLowerCase());
      let offset = (target - now.getDay() + 7) % 7;
      if (offset === 0 || /^next\s/i.test(weekday[0])) offset += 7;
      day = addDays(dayKey(now), offset);
      title = title.replace(weekday[0], " ");
    }
  }

  const clock = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)?(\d{1,2}):(\d{2})\b/i.exec(title);
  if (clock) {
    if (clock[3]) {
      let hours = Number(clock[1]);
      const rest = Number(clock[2] ?? 0);
      if (hours >= 1 && hours <= 12 && rest <= 59) {
        hours %= 12;
        if (clock[3].toLowerCase() === "pm") hours += 12;
        minutes = snapMinutes(hours * 60 + rest);
      }
    } else {
      const hours = Number(clock[4]);
      const rest = Number(clock[5]);
      if (hours <= 23 && rest <= 59) minutes = snapMinutes(hours * 60 + rest);
    }
    if (minutes !== null) title = title.replace(clock[0], " ");
  }

  title = title.replace(/\s+/g, " ").replace(/^[,;\-\s]+|[,;\-\s]+$/g, "").trim();
  return { title: title || "Untitled", day, minutes, durationMinutes };
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** Materialized series keep every occurrence independently editable and syncable. */
export function recurrenceDays(day: string, frequency: RecurrenceFrequency, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const step = index + 1;
    if (frequency === "daily") return addDays(day, step);
    if (frequency === "weekly") return addDays(day, step * 7);
    return addMonthsClamped(day, step * (frequency === "yearly" ? 12 : 1));
  });
}

export function moveSchedule(page: Page, dayOffset: number, minuteOffset: number): string | null {
  const due = parseDue(page.scheduledAt);
  if (!due) return null;
  const nextDay = addDays(due.day, dayOffset);
  if (due.minutes === null) return nextDay;
  return formatDue(nextDay, snapMinutes(due.minutes + minuteOffset));
}
