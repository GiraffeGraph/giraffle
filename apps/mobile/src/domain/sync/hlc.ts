export interface Hlc { physicalMs: number; logical: number }
export interface Stamp { clock: Hlc; deviceId: string; operationId: string }
export interface Lww<T> { value: T; stamp: Stamp }

export function tick(local: Hlc, now = Date.now()): Hlc {
  return now > local.physicalMs ? { physicalMs: now, logical: 0 } : { physicalMs: local.physicalMs, logical: local.logical + 1 };
}
export function compareStamp(a: Stamp, b: Stamp): number {
  return a.clock.physicalMs - b.clock.physicalMs || a.clock.logical - b.clock.logical || (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0);
}
export function mergeLww<T>(current: Lww<T> | undefined, candidate: Lww<T>): Lww<T> {
  return !current || compareStamp(candidate.stamp, current.stamp) > 0 ? candidate : current;
}
