import { DEFAULT_STATE_IDS, EMPTY_DOCUMENT, type Page, type PageState } from "@giraffle/domain";
import {
  calendarPages,
  layoutTimedPages,
  moveSchedule,
  parseQuickSchedule,
  recurrenceDays,
} from "@/calendar/calendarModel";

const states: PageState[] = [
  { id: DEFAULT_STATE_IDS.forever, title: "Forever", family: "forever", color: null, icon: null, position: "a0", isDefault: true },
  { id: DEFAULT_STATE_IDS.open, title: "Open", family: "open", color: null, icon: null, position: "a1", isDefault: true },
  { id: DEFAULT_STATE_IDS.done, title: "Done", family: "done", color: null, icon: null, position: "a2", isDefault: true },
];

const page = (id: string, scheduledAt: string | null, patch: Partial<Page> = {}): Page => ({
  id,
  title: id,
  icon: null,
  parentId: null,
  position: id,
  stateId: DEFAULT_STATE_IDS.open,
  categoryId: null,
  priority: null,
  scheduledAt,
  durationMinutes: 30,
  calendarColor: null,
  description: null,
  childView: "list",
  isPinned: false,
  isArchived: false,
  document: EMPTY_DOCUMENT,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

describe("calendar model", () => {
  it("shows every scheduled state family and keeps completed history by default", () => {
    const pages = [
      page("reference", "2026-08-05", { stateId: DEFAULT_STATE_IDS.forever }),
      page("work", "2026-08-05T09:00"),
      page("finished", "2026-08-04T10:00", { stateId: DEFAULT_STATE_IDS.done }),
      page("hidden", "2026-08-05", { isArchived: true }),
      page("unscheduled", null),
    ];
    expect(calendarPages(pages, states).map((item) => item.id)).toEqual([
      "finished",
      "reference",
      "work",
    ]);
  });

  it("can hide completed items without removing other state families", () => {
    const pages = [
      page("reference", "2026-08-05", { stateId: DEFAULT_STATE_IDS.forever }),
      page("finished", "2026-08-05", { stateId: DEFAULT_STATE_IDS.done }),
    ];
    expect(calendarPages(pages, states, {
      showCompleted: false,
      priorities: new Set(),
      stateIds: new Set(),
    }).map((item) => item.id)).toEqual(["reference"]);
  });

  it("lays overlapping events beside one another and reuses free lanes", () => {
    const layout = layoutTimedPages([
      page("a", "2026-08-05T09:00", { durationMinutes: 60 }),
      page("b", "2026-08-05T09:30", { durationMinutes: 30 }),
      page("c", "2026-08-05T10:00", { durationMinutes: 30 }),
    ]);
    expect(layout.map(({ page: item, column, columns }) => [item.id, column, columns])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });

  it("parses useful local quick-capture phrases", () => {
    const now = new Date(2026, 7, 5, 8, 0);
    expect(parseQuickSchedule("Dentist tomorrow at 3:30pm for 1h 15m", now)).toEqual({
      title: "Dentist",
      day: "2026-08-06",
      minutes: 15 * 60 + 30,
      durationMinutes: 75,
    });
    expect(parseQuickSchedule("Review Friday 09:00", now)).toMatchObject({
      title: "Review",
      day: "2026-08-07",
      minutes: 540,
    });
  });

  it("builds editable recurring series without drifting at month ends", () => {
    expect(recurrenceDays("2026-01-31", "monthly", 3)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(recurrenceDays("2026-08-05", "weekly", 2)).toEqual(["2026-08-12", "2026-08-19"]);
  });

  it("moves timed and all-day schedules without changing their shape", () => {
    expect(moveSchedule(page("timed", "2026-08-05T09:00"), 1, 30)).toBe("2026-08-06T09:30");
    expect(moveSchedule(page("all-day", "2026-08-05"), -1, 60)).toBe("2026-08-04");
  });
});
