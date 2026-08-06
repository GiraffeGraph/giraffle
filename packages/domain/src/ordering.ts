import { generateKeyBetween } from "fractional-indexing";

/**
 * Sibling ordering uses fractional index strings so a move only rewrites the
 * moved row: two devices can insert into the same gap without colliding.
 */
export function positionBetween(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before, after);
}

/** Position first, id second, so equal positions still order deterministically. */
export function sortByPosition<T extends { id: string; position: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) =>
    a.position < b.position
      ? -1
      : a.position > b.position
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  );
}
