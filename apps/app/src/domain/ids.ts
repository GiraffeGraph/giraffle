import * as Crypto from "expo-crypto";
import { generateKeyBetween } from "fractional-indexing";

export function createId(): string {
  return Crypto.randomUUID();
}

export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function sortByPosition<T extends { id: string; position: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
