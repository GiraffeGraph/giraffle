import {
  compareVersionStamps,
  type VersionStamp,
} from "./hybrid-logical-clock";

export const MAX_EXCALIDRAW_ELEMENTS_PER_CANVAS = 100_000;

export interface ExcalidrawElementLike extends Record<string, unknown> {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
}

export interface VersionedExcalidrawElement {
  element: ExcalidrawElementLike;
  stamp: VersionStamp;
}

export interface ExcalidrawElementConflict {
  elementId: string;
  winner: VersionedExcalidrawElement;
  loser: VersionedExcalidrawElement;
}

export interface ExcalidrawMergeResult {
  elements: VersionedExcalidrawElement[];
  conflicts: ExcalidrawElementConflict[];
}

export class ExcalidrawMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcalidrawMergeError";
  }
}

function assertElement(candidate: VersionedExcalidrawElement) {
  const { element } = candidate;
  if (
    !element ||
    typeof element !== "object" ||
    Array.isArray(element) ||
    typeof element.id !== "string" ||
    element.id.length === 0 ||
    element.id.length > 128 ||
    !Number.isSafeInteger(element.version) ||
    element.version < 1 ||
    !Number.isSafeInteger(element.versionNonce) ||
    element.versionNonce < 0 ||
    typeof element.isDeleted !== "boolean"
  ) {
    throw new ExcalidrawMergeError("Excalidraw element metadata is invalid");
  }
}

/**
 * Excalidraw collaboration semantics: larger version wins; at equal version,
 * smaller versionNonce wins. The signed operation stamp is a final deterministic
 * fallback for the otherwise pathological equal version+nonce case.
 */
export function compareExcalidrawElements(
  left: VersionedExcalidrawElement,
  right: VersionedExcalidrawElement,
) {
  assertElement(left);
  assertElement(right);
  if (left.element.version !== right.element.version) {
    return left.element.version < right.element.version ? -1 : 1;
  }
  if (left.element.versionNonce !== right.element.versionNonce) {
    return left.element.versionNonce > right.element.versionNonce ? -1 : 1;
  }
  return compareVersionStamps(left.stamp, right.stamp);
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort(compareCodeUnits);
    const rightKeys = Object.keys(rightRecord).sort(compareCodeUnits);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          jsonValuesEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

function compareCodeUnits(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function mergeExcalidrawElements(
  candidates: readonly VersionedExcalidrawElement[],
): ExcalidrawMergeResult {
  if (candidates.length > MAX_EXCALIDRAW_ELEMENTS_PER_CANVAS * 4) {
    throw new ExcalidrawMergeError("Excalidraw merge batch is too large");
  }

  const winners = new Map<string, VersionedExcalidrawElement>();
  const conflicts: ExcalidrawElementConflict[] = [];

  for (const candidate of candidates) {
    assertElement(candidate);
    const current = winners.get(candidate.element.id);
    if (!current) {
      winners.set(candidate.element.id, candidate);
      continue;
    }

    const order = compareExcalidrawElements(candidate, current);
    if (order === 0 && !jsonValuesEqual(candidate.element, current.element)) {
      throw new ExcalidrawMergeError(
        "Equal Excalidraw version metadata contains divergent payloads",
      );
    }

    const winner = order > 0 ? candidate : current;
    const loser = order > 0 ? current : candidate;
    winners.set(candidate.element.id, winner);

    if (
      candidate.element.version === current.element.version &&
      candidate.element.versionNonce !== current.element.versionNonce &&
      !candidate.element.isDeleted &&
      !current.element.isDeleted
    ) {
      conflicts.push({
        elementId: candidate.element.id,
        winner,
        loser,
      });
    }
  }

  const elements = [...winners.values()].sort((left, right) =>
    compareCodeUnits(left.element.id, right.element.id),
  );
  if (elements.length > MAX_EXCALIDRAW_ELEMENTS_PER_CANVAS) {
    throw new ExcalidrawMergeError("Excalidraw canvas exceeds the element limit");
  }

  conflicts.sort((left, right) => compareCodeUnits(left.elementId, right.elementId));
  return { elements, conflicts };
}

export function visibleExcalidrawElements(
  elements: readonly VersionedExcalidrawElement[],
) {
  return elements.filter(({ element }) => !element.isDeleted);
}
