import { encode as encodeCbor } from "cborg";
import { hash, randomBytes } from "../crypto/vaultCrypto";

// Crockford base32 without I, L, O or U, so a code read aloud or copied by
// hand cannot collide with a digit that looks like it.
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

export function createRecoveryCode(): { code: string; secret: Uint8Array } {
  const secret = randomBytes(32);
  const checksum = hash(encodeCbor(["giraffle-recovery-code", 1, secret])).slice(0, 5);
  const payload = `${toBase32(secret)}${toBase32(checksum)}`;
  return { secret, code: `GIR1-${payload.match(/.{1,4}/g)?.join("-") ?? payload}` };
}
