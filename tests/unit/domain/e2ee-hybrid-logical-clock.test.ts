import { describe, expect, it } from "vitest";
import {
  HybridClockError,
  compareHybridClocks,
  compareVersionStamps,
  getFutureClockDriftMs,
  initializeHybridClock,
  observeHybridClock,
  tickHybridClock,
} from "@/domain/e2ee/hybrid-logical-clock";

describe("hybrid logical clock", () => {
  it("advances physical time when the wall clock moves forward", () => {
    expect(tickHybridClock({ physicalMs: 100, logical: 7 }, 101)).toEqual({
      physicalMs: 101,
      logical: 0,
    });
  });

  it("remains monotonic when the wall clock stalls or moves backwards", () => {
    const stalled = tickHybridClock({ physicalMs: 100, logical: 7 }, 100);
    const rolledBack = tickHybridClock(stalled, 50);

    expect(stalled).toEqual({ physicalMs: 100, logical: 8 });
    expect(rolledBack).toEqual({ physicalMs: 100, logical: 9 });
  });

  it.each([
    {
      label: "both clocks share the maximum physical time",
      local: { physicalMs: 100, logical: 3 },
      remote: { physicalMs: 100, logical: 8 },
      now: 90,
      expected: { physicalMs: 100, logical: 9 },
    },
    {
      label: "local clock owns the maximum",
      local: { physicalMs: 120, logical: 3 },
      remote: { physicalMs: 100, logical: 8 },
      now: 110,
      expected: { physicalMs: 120, logical: 4 },
    },
    {
      label: "remote clock owns the maximum",
      local: { physicalMs: 100, logical: 3 },
      remote: { physicalMs: 120, logical: 8 },
      now: 110,
      expected: { physicalMs: 120, logical: 9 },
    },
    {
      label: "wall clock owns the maximum",
      local: { physicalMs: 100, logical: 3 },
      remote: { physicalMs: 120, logical: 8 },
      now: 130,
      expected: { physicalMs: 130, logical: 0 },
    },
  ])("applies the receive rule when $label", ({ local, remote, now, expected }) => {
    expect(observeHybridClock(local, remote, now)).toEqual(expected);
  });

  it("orders equal clocks deterministically without locale rules", () => {
    const base = {
      clock: { physicalMs: 100, logical: 2 },
      operationId: "op-1",
    };

    expect(
      compareVersionStamps(
        { ...base, deviceId: "device-a" },
        { ...base, deviceId: "device-b" },
      ),
    ).toBeLessThan(0);

    expect(
      compareVersionStamps(
        { ...base, deviceId: "device-a", operationId: "op-2" },
        { ...base, deviceId: "device-a", operationId: "op-1" },
      ),
    ).toBeGreaterThan(0);
  });

  it("compares physical then logical components", () => {
    expect(
      compareHybridClocks(
        { physicalMs: 99, logical: 999 },
        { physicalMs: 100, logical: 0 },
      ),
    ).toBeLessThan(0);
    expect(
      compareHybridClocks(
        { physicalMs: 100, logical: 2 },
        { physicalMs: 100, logical: 1 },
      ),
    ).toBeGreaterThan(0);
  });

  it("reports future drift without making a divergent local rejection decision", () => {
    expect(
      getFutureClockDriftMs({ physicalMs: 1_000_000, logical: 0 }, 900_000),
    ).toBe(100_000);
    expect(getFutureClockDriftMs({ physicalMs: 1, logical: 0 }, 2)).toBe(0);
  });

  it("rejects invalid values and logical counter exhaustion", () => {
    expect(() => initializeHybridClock(-1)).toThrow(HybridClockError);
    expect(() =>
      tickHybridClock(
        { physicalMs: 100, logical: Number.MAX_SAFE_INTEGER },
        99,
      ),
    ).toThrow(/counter exhausted/);
  });
});
