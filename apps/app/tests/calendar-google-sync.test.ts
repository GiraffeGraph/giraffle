import { dayKey, EMPTY_DOCUMENT, parseDue, type Page } from "@giraffle/domain";
import {
  googleCalendarEventForPage,
  scheduleFromGoogleCalendarEvent,
} from "@/calendar/googleCalendarSync";

const page = (scheduledAt: string, durationMinutes: number | null): Page => ({
  id: "page-1",
  title: "Design review",
  icon: null,
  parentId: null,
  position: "a0",
  stateId: "giraffle-state-open",
  categoryId: null,
  priority: null,
  scheduledAt,
  durationMinutes,
  calendarColor: null,
  description: null,
  childView: "list",
  isPinned: false,
  isArchived: false,
  document: EMPTY_DOCUMENT,
  createdAt: 1,
  updatedAt: 1,
});

describe("Google Calendar conversion", () => {
  it("exports all-day pages with Google's exclusive end date", () => {
    expect(googleCalendarEventForPage(page("2026-08-05", null))).toEqual({
      summary: "Design review",
      start: { date: "2026-08-05" },
      end: { date: "2026-08-06" },
      extendedProperties: { private: { girafflePageId: "page-1" } },
    });
  });

  it("exports timed pages as instants without changing their local wall time", () => {
    const body = googleCalendarEventForPage(page("2026-08-05T09:30", 45));
    const start = new Date((body.start as { dateTime: string }).dateTime);
    const end = new Date((body.end as { dateTime: string }).dateTime);
    expect(dayKey(start)).toBe("2026-08-05");
    expect(start.getHours() * 60 + start.getMinutes()).toBe(570);
    expect((end.getTime() - start.getTime()) / 60_000).toBe(45);
  });

  it("maps canonical calendar colors to Google event colors", () => {
    const colored = { ...page("2026-08-05", null), calendarColor: "#d60000" };
    expect(googleCalendarEventForPage(colored)).toMatchObject({ colorId: "11" });
  });

  it("imports timed and all-day Google events into canonical schedules", () => {
    expect(scheduleFromGoogleCalendarEvent({
      start: { date: "2026-08-05" },
      end: { date: "2026-08-06" },
    })).toEqual({ scheduledAt: "2026-08-05", durationMinutes: null });

    const start = new Date(2026, 7, 5, 14, 15);
    const end = new Date(2026, 7, 5, 15, 45);
    const schedule = scheduleFromGoogleCalendarEvent({
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    });
    expect(parseDue(schedule?.scheduledAt ?? null)).toEqual({ day: "2026-08-05", minutes: 14 * 60 + 15 });
    expect(schedule?.durationMinutes).toBe(90);
  });
});
