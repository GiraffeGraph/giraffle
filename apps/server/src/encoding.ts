/**
 * Rejects oversized payloads from the encoded length before allocating, so a
 * hostile body cannot force a large decode.
 */
export function decodeBoundedBase64(value: unknown, maximumBytes: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil((maximumBytes * 4) / 3) + 8 ||
    !/^[A-Za-z0-9_-]+={0,2}$/.test(value)
  ) {
    throw new Error("Invalid encoded binary payload");
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.length > maximumBytes) {
    throw new Error("Binary payload exceeds limit");
  }
  return decoded;
}

export function encodeBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
