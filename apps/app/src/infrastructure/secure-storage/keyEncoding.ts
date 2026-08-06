const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const REVERSE = new Map<string, number>(
  [...ALPHABET].map((character, index) => [character, index]),
);

/**
 * URL-safe base64 without padding, written out rather than taken from a
 * platform module: the same encoded key has to survive a round trip through
 * either the Keychain (native) or an origin-private byte store (web), and
 * neither Hermes nor every browser exposes the same codec.
 */
export function encodeKey(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk =
      (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    result += ALPHABET[(chunk >> 18) & 63];
    result += ALPHABET[(chunk >> 12) & 63];
    if (second === undefined) break;
    result += ALPHABET[(chunk >> 6) & 63];
    if (third === undefined) break;
    result += ALPHABET[chunk & 63];
  }
  return result;
}

export function decodeKey(value: string): Uint8Array {
  const length = Math.floor((value.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let offset = 0;
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    const digit = REVERSE.get(character);
    if (digit === undefined) {
      throw new Error("Stored key material is not valid base64url");
    }
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }

  return bytes.subarray(0, offset);
}
