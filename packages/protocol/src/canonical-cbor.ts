import {
  decode,
  encode,
  rfc8949EncodeOptions,
  type DecodeOptions,
} from "cborg";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

const STRICT_DECODE_OPTIONS: DecodeOptions = {
  strict: true,
  allowIndefinite: false,
  allowUndefined: false,
  allowInfinity: false,
  allowNaN: false,
  allowBigInt: false,
  rejectDuplicateMapKeys: true,
  useMaps: true,
};

export const MAX_CANONICAL_DEPTH = 64;

export class CanonicalEncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalEncodingError";
  }
}

function assertCanonicalSubset(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): asserts value is CanonicalValue {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new CanonicalEncodingError(
      `${path} exceeds maximum canonical nesting depth`,
    );
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new CanonicalEncodingError(`${path} must be a safe integer`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new CanonicalEncodingError(`${path} contains an unsupported value`);
  }

  if (ancestors.has(value)) {
    throw new CanonicalEncodingError(`${path} contains a cyclic reference`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new CanonicalEncodingError(`${path} contains a sparse array`);
        }
        assertCanonicalSubset(
          value[index],
          `${path}[${index}]`,
          ancestors,
          depth + 1,
        );
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalEncodingError(`${path} must be a plain object`);
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new CanonicalEncodingError(`${path} contains a symbol key`);
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new CanonicalEncodingError(
          `${path}.${key} must be an enumerable data property`,
        );
      }

      assertCanonicalSubset(
        descriptor.value,
        `${path}.${key}`,
        ancestors,
        depth + 1,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}

function normalizeDecoded(
  value: unknown,
  path: string,
  depth: number,
): unknown {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new CanonicalEncodingError(
      `${path} exceeds maximum canonical nesting depth`,
    );
  }

  if (value instanceof Map) {
    const normalized: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;

    for (const [key, child] of value) {
      if (typeof key !== "string") {
        throw new CanonicalEncodingError(`${path} contains a non-string map key`);
      }
      normalized[key] = normalizeDecoded(child, `${path}.${key}`, depth + 1);
    }
    return normalized;
  }

  if (Array.isArray(value)) {
    return value.map((child, index) =>
      normalizeDecoded(child, `${path}[${index}]`, depth + 1),
    );
  }

  return value;
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/** RFC 8949 deterministic CBOR over Giraffle's deliberately small data subset. */
export function encodeCanonical(value: unknown): Uint8Array {
  assertCanonicalSubset(value, "$", new WeakSet(), 0);

  try {
    return encode(value, rfc8949EncodeOptions);
  } catch (error) {
    throw new CanonicalEncodingError(
      error instanceof Error ? error.message : "Canonical CBOR encoding failed",
    );
  }
}

/**
 * Decodes only canonical CBOR. Re-encoding closes cborg's documented gaps for
 * enforcing map ordering and shortest float forms during decode.
 */
export function decodeCanonical(bytes: Uint8Array): CanonicalValue {
  let value: unknown;

  try {
    value = normalizeDecoded(decode(bytes, STRICT_DECODE_OPTIONS), "$", 0);
  } catch (error) {
    throw new CanonicalEncodingError(
      error instanceof Error ? error.message : "Canonical CBOR decoding failed",
    );
  }

  assertCanonicalSubset(value, "$", new WeakSet(), 0);
  const canonicalBytes = encodeCanonical(value);

  if (!bytesEqual(bytes, canonicalBytes)) {
    throw new CanonicalEncodingError("CBOR input is not in canonical form");
  }

  return value;
}
