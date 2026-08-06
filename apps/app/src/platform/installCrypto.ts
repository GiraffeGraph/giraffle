import { getRandomValues } from "expo-crypto";

/**
 * Hermes ships no WebCrypto. libsodium's ESM build refuses to even load without
 * a secure random source, and `generateId` would silently fall back to
 * `Math.random` — which vault and record identifiers must never come from.
 *
 * Imported from the app entry so this runs before the router pulls in anything
 * that reaches for randomness.
 */
if (typeof globalThis.crypto?.getRandomValues !== "function") {
  const existing = globalThis.crypto as Partial<Crypto> | undefined;
  const polyfill = { ...existing, getRandomValues } as Crypto;

  Object.defineProperty(globalThis, "crypto", {
    value: polyfill,
    configurable: true,
    enumerable: false,
    writable: false,
  });
}
