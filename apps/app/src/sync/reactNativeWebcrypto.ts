import { getRandomValues } from "expo-crypto";

/**
 * Yjs reaches randomness through lib0, whose React Native export expects the
 * `isomorphic-webcrypto` package. That package is not part of this app, and it
 * would only wrap what Expo already provides natively, so Metro resolves that
 * specifier here instead. Only the three members lib0 touches exist.
 */
export default {
  ensureSecure: () => undefined,
  getRandomValues,
  subtle: undefined,
};
