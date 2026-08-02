export interface HybridLogicalClock {
  physicalMs: number;
  logical: number;
}

export interface VersionStamp {
  clock: HybridLogicalClock;
  deviceId: string;
  operationId: string;
}

export const RECOMMENDED_FUTURE_CLOCK_WARNING_MS = 5 * 60 * 1000;

export class HybridClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HybridClockError";
  }
}

function assertNonNegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HybridClockError(`${label} must be a non-negative safe integer`);
  }
}

export function assertHybridLogicalClock(
  value: HybridLogicalClock,
  label = "clock",
) {
  assertNonNegativeSafeInteger(value.physicalMs, `${label}.physicalMs`);
  assertNonNegativeSafeInteger(value.logical, `${label}.logical`);
}

function incrementLogical(value: number) {
  if (value >= Number.MAX_SAFE_INTEGER) {
    throw new HybridClockError("Hybrid logical counter exhausted");
  }
  return value + 1;
}

/** Creates the first local clock value for a wall-clock instant. */
export function initializeHybridClock(nowMs: number): HybridLogicalClock {
  assertNonNegativeSafeInteger(nowMs, "nowMs");
  return { physicalMs: nowMs, logical: 0 };
}

/** Advances a local clock while remaining monotonic across wall-clock rollback. */
export function tickHybridClock(
  local: HybridLogicalClock,
  nowMs: number,
): HybridLogicalClock {
  assertHybridLogicalClock(local, "local");
  assertNonNegativeSafeInteger(nowMs, "nowMs");

  if (nowMs > local.physicalMs) {
    return { physicalMs: nowMs, logical: 0 };
  }

  return {
    physicalMs: local.physicalMs,
    logical: incrementLogical(local.logical),
  };
}

/** Standard HLC receive rule for observing a remote event. */
export function observeHybridClock(
  local: HybridLogicalClock,
  remote: HybridLogicalClock,
  nowMs: number,
): HybridLogicalClock {
  assertHybridLogicalClock(local, "local");
  assertHybridLogicalClock(remote, "remote");
  assertNonNegativeSafeInteger(nowMs, "nowMs");

  const physicalMs = Math.max(local.physicalMs, remote.physicalMs, nowMs);
  let logical: number;

  if (
    physicalMs === local.physicalMs &&
    physicalMs === remote.physicalMs
  ) {
    logical = incrementLogical(Math.max(local.logical, remote.logical));
  } else if (physicalMs === local.physicalMs) {
    logical = incrementLogical(local.logical);
  } else if (physicalMs === remote.physicalMs) {
    logical = incrementLogical(remote.logical);
  } else {
    logical = 0;
  }

  return { physicalMs, logical };
}

export function compareHybridClocks(
  left: HybridLogicalClock,
  right: HybridLogicalClock,
) {
  assertHybridLogicalClock(left, "left");
  assertHybridLogicalClock(right, "right");

  if (left.physicalMs !== right.physicalMs) {
    return left.physicalMs < right.physicalMs ? -1 : 1;
  }
  if (left.logical !== right.logical) {
    return left.logical < right.logical ? -1 : 1;
  }
  return 0;
}

function compareCodeUnits(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Deterministic LWW ordering after HLC equality. No locale-sensitive compare. */
export function compareVersionStamps(left: VersionStamp, right: VersionStamp) {
  const clockOrder = compareHybridClocks(left.clock, right.clock);
  if (clockOrder !== 0) {
    return clockOrder;
  }

  const deviceOrder = compareCodeUnits(left.deviceId, right.deviceId);
  if (deviceOrder !== 0) {
    return deviceOrder;
  }

  return compareCodeUnits(left.operationId, right.operationId);
}

/** Diagnostic only; rejecting on local wall time would risk device divergence. */
export function getFutureClockDriftMs(
  remote: HybridLogicalClock,
  nowMs: number,
) {
  assertHybridLogicalClock(remote, "remote");
  assertNonNegativeSafeInteger(nowMs, "nowMs");
  return Math.max(0, remote.physicalMs - nowMs);
}
