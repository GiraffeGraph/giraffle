import {
  addDays,
  clampMinutes,
  dayKey,
  formatClock,
  formatDue,
  parseDue,
  snapMinutes,
} from "@/domain/stride/schedule";

describe("stride schedule", () => {
  test("reads a bare day as all-day", () => {
    expect(parseDue("2026-08-05")).toEqual({ day: "2026-08-05", minutes: null });
  });

  test("reads a local time into minutes since midnight", () => {
    expect(parseDue("2026-08-05T09:30")).toEqual({ day: "2026-08-05", minutes: 570 });
  });

  test("ignores anything that is not a due date", () => {
    expect(parseDue(null)).toBeNull();
    expect(parseDue("tomorrow")).toBeNull();
  });

  test("formats back into the stored shape", () => {
    expect(formatDue("2026-08-05", 570)).toBe("2026-08-05T09:30");
    expect(formatDue("2026-08-05", null)).toBe("2026-08-05");
  });

  test("round trips a time", () => {
    const due = formatDue("2026-08-05", 1425);
    expect(parseDue(due)).toEqual({ day: "2026-08-05", minutes: 1425 });
  });

  test("snaps to the quarter hour and stays inside the day", () => {
    expect(snapMinutes(97)).toBe(90);
    expect(snapMinutes(98)).toBe(105);
    expect(snapMinutes(-40)).toBe(0);
    expect(clampMinutes(5000)).toBe(24 * 60 - 15);
  });

  test("moves across day boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("formats a clock label", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(605)).toBe("10:05");
  });

  test("day key follows the local calendar", () => {
    expect(dayKey(new Date(2026, 7, 5, 23, 30))).toBe("2026-08-05");
  });
});
