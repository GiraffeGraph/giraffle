import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampMinutes,
  dayKey,
  formatClock,
  formatDue,
  groupPagesByDay,
  monthCells,
  parseDue,
  snapMinutes,
  startOfWeek,
} from "@giraffle/domain";

describe("page schedule", () => {
  it("reads a bare day as all-day", () => {
    expect(parseDue("2026-08-05")).toEqual({ day: "2026-08-05", minutes: null });
  });

  it("reads a local time into minutes since midnight", () => {
    expect(parseDue("2026-08-05T09:30")).toEqual({ day: "2026-08-05", minutes: 570 });
  });

  it("ignores anything that is not a due date", () => {
    expect(parseDue(null)).toBeNull();
    expect(parseDue("tomorrow")).toBeNull();
  });

  it("formats back into the stored shape", () => {
    expect(formatDue("2026-08-05", 570)).toBe("2026-08-05T09:30");
    expect(formatDue("2026-08-05", null)).toBe("2026-08-05");
  });

  it("round trips a time", () => {
    const due = formatDue("2026-08-05", 1425);
    expect(parseDue(due)).toEqual({ day: "2026-08-05", minutes: 1425 });
  });

  it("snaps to the quarter hour and stays inside the day", () => {
    expect(snapMinutes(97)).toBe(90);
    expect(snapMinutes(98)).toBe(105);
    expect(snapMinutes(-40)).toBe(0);
    expect(clampMinutes(5000)).toBe(24 * 60 - 15);
  });

  it("moves across day boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("formats a clock label", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(605)).toBe("10:05");
  });

  it("day key follows the local calendar", () => {
    expect(dayKey(new Date(2026, 7, 5, 23, 30))).toBe("2026-08-05");
  });
});

describe("calendar grids", () => {
  it("starts a week on the Monday that owns the day", () => {
    expect(startOfWeek("2026-08-21")).toBe("2026-08-17");
    expect(startOfWeek("2026-08-17")).toBe("2026-08-17");
    expect(startOfWeek("2026-08-23")).toBe("2026-08-17");
  });

  it("steps months from the first, so a long month cannot overshoot", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-03-15", -1)).toBe("2026-02-01");
    expect(addMonths("2026-12-09", 1)).toBe("2027-01-01");
  });

  it("draws six whole weeks around the month", () => {
    const cells = monthCells("2026-08-21");
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBe("2026-07-27");
    expect(cells.at(-1)).toBe("2026-09-06");
    expect(cells.filter((day) => day.startsWith("2026-08"))).toHaveLength(31);
  });

  it("keeps every cell one day after the last", () => {
    const cells = monthCells("2026-02-10");
    for (let index = 1; index < cells.length; index += 1) {
      expect(cells[index]).toBe(addDays(cells[index - 1] as string, 1));
    }
  });
});

describe("calendar grouping", () => {
  const page = (id: string, scheduledAt: string | null) => ({ id, scheduledAt });

  it("buckets pages by the day they are due", () => {
    const days = groupPagesByDay([page("a", "2026-08-21T09:30"), page("b", "2026-08-22"), page("c", "2026-08-21")]);
    expect([...days.keys()].sort()).toEqual(["2026-08-21", "2026-08-22"]);
    expect(days.get("2026-08-21")?.map((item) => item.id)).toEqual(["c", "a"]);
  });

  it("leaves unscheduled pages off the calendar", () => {
    const days = groupPagesByDay([page("a", null), page("b", "tomorrow")]);
    expect(days.size).toBe(0);
  });

  it("orders all-day pages ahead of timed ones", () => {
    const days = groupPagesByDay([page("a", "2026-08-21T18:00"), page("b", "2026-08-21"), page("c", "2026-08-21T07:15")]);
    expect(days.get("2026-08-21")?.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });
});
