import { describe, expect, it } from "vitest";
import {
  CanonicalEncodingError,
  decodeCanonical,
  encodeCanonical,
} from "@/domain/e2ee/canonical-cbor";

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("canonical CBOR", () => {
  it("produces RFC 8949 deterministic bytes regardless of insertion order", () => {
    const left = encodeCanonical({ longer: 3, b: 2, a: 1 });
    const right = encodeCanonical({ a: 1, longer: 3, b: 2 });

    expect(toHex(left)).toBe("a3616101616202666c6f6e67657203");
    expect(left).toEqual(right);
    expect(decodeCanonical(left)).toEqual({ a: 1, b: 2, longer: 3 });
  });

  it("round-trips nested byte arrays", () => {
    const encoded = encodeCanonical({
      bytes: new Uint8Array([0, 1, 254, 255]),
      nested: [true, null, "ok", 42],
    });

    expect(decodeCanonical(encoded)).toEqual({
      bytes: new Uint8Array([0, 1, 254, 255]),
      nested: [true, null, "ok", 42],
    });
  });

  it.each([
    ["fraction", { value: 1.5 }],
    ["NaN", { value: Number.NaN }],
    ["infinity", { value: Number.POSITIVE_INFINITY }],
    ["undefined", { value: undefined }],
    ["date", { value: new Date(0) }],
    ["bigint", { value: BigInt(1) }],
    ["sparse array", Array(1)],
  ])("rejects unsupported %s values", (_label, value) => {
    expect(() => encodeCanonical(value)).toThrow(CanonicalEncodingError);
  });

  it("decodes map keys into null-prototype objects", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.__proto__ = { polluted: true };
    const decoded = decodeCanonical(encodeCanonical(value)) as Record<
      string,
      unknown
    >;

    expect(Object.getPrototypeOf(decoded)).toBeNull();
    expect(decoded.__proto__).toEqual({ polluted: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rejects excessive nesting depth", () => {
    let value: unknown = null;
    for (let depth = 0; depth < 66; depth += 1) {
      value = [value];
    }
    expect(() => encodeCanonical(value)).toThrow(/maximum canonical nesting depth/);
  });

  it("rejects cyclic values", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => encodeCanonical(value)).toThrow(/cyclic reference/);
  });

  it("rejects non-minimal integers, unsorted maps, and duplicate map keys", () => {
    expect(() => decodeCanonical(new Uint8Array([0x18, 0x01]))).toThrow(
      CanonicalEncodingError,
    );

    const unsortedMap = new Uint8Array([
      0xa2,
      0x61,
      0x62,
      0x02,
      0x61,
      0x61,
      0x01,
    ]);
    expect(() => decodeCanonical(unsortedMap)).toThrow(/not in canonical form/);

    const duplicateMapKey = new Uint8Array([
      0xa2,
      0x61,
      0x61,
      0x01,
      0x61,
      0x61,
      0x02,
    ]);
    expect(() => decodeCanonical(duplicateMapKey)).toThrow(
      CanonicalEncodingError,
    );
  });
});
