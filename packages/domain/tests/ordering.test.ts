import { describe, expect, it } from "vitest";
import { positionBetween, sortByPosition } from "@giraffle/domain";

describe("fractional ordering", () => {
  it("generates a key that sorts strictly between its neighbours", () => {
    const first = positionBetween(null, null);
    const second = positionBetween(first, null);
    const middle = positionBetween(first, second);

    expect(first < middle).toBe(true);
    expect(middle < second).toBe(true);
  });

  it("keeps inserting into the same gap without exhausting it", () => {
    let low = positionBetween(null, null);
    const high = positionBetween(low, null);
    const inserted: string[] = [];

    for (let step = 0; step < 25; step++) {
      low = positionBetween(low, high);
      inserted.push(low);
    }

    expect(new Set(inserted).size).toBe(inserted.length);
    expect([...inserted].sort()).toEqual(inserted);
  });

  it("sorts by position and never leaves ties to insertion order", () => {
    const first = positionBetween(null, null);
    const second = positionBetween(first, null);
    const middle = positionBetween(first, second);

    expect(
      sortByPosition([
        { id: "b", position: second },
        { id: "m", position: middle },
        { id: "a", position: first },
      ]).map((item) => item.id),
    ).toEqual(["a", "m", "b"]);

    expect(
      sortByPosition([
        { id: "z", position: first },
        { id: "a", position: first },
      ]).map((item) => item.id),
    ).toEqual(["a", "z"]);
  });

  it("does not mutate the input", () => {
    const items = [
      { id: "b", position: "a1" },
      { id: "a", position: "a0" },
    ];
    sortByPosition(items);

    expect(items.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
