import { DEFAULT_STATE_IDS, EMPTY_DOCUMENT, type Page } from "@giraffle/domain";
import { exportCalendarIcs, importCalendarIcs } from "@/calendar/ics";

const page = (id: string, title: string, scheduledAt: string, durationMinutes: number | null): Page => ({
  id,
  title,
  icon: null,
  parentId: null,
  position: id,
  stateId: DEFAULT_STATE_IDS.open,
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

describe("calendar ICS", () => {
  it("round trips all-day and timed pages", () => {
    const source = [
      { ...page("all", "Conference, day one", "2026-08-05", null), calendarColor: "#d60000", description: "Main hall" },
      page("timed", "Deep work", "2026-08-06T09:30", 75),
    ];
    const encoded = exportCalendarIcs(source);
    expect(encoded).toContain("DTSTART;VALUE=DATE:20260805");
    expect(encoded).toContain("DTSTART:20260806T093000");
    expect(importCalendarIcs(encoded)).toEqual([
      { title: "Conference, day one", scheduledAt: "2026-08-05", durationMinutes: null, calendarColor: "#d60000", description: "Main hall" },
      { title: "Deep work", scheduledAt: "2026-08-06T09:30", durationMinutes: 75, calendarColor: null, description: null },
    ]);
  });

  it("unfolds long lines and skips events without a valid start", () => {
    const title = "A very long calendar title that crosses the seventy-five byte folding boundary cleanly";
    const encoded = exportCalendarIcs([page("long", title, "2026-08-05T12:00", 30)]);
    expect(encoded).toContain("\r\n ");
    expect(importCalendarIcs(`${encoded}\r\nBEGIN:VEVENT\r\nSUMMARY:Broken\r\nEND:VEVENT`)[0]?.title).toBe(title);
  });
});
