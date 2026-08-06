// Vault, device and record ids must stay distinct across a test run; a constant
// would silently collapse rows that the merge logic is meant to keep apart.
let mockIdSequence = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockIdSequence += 1;
    return `00000000-0000-4000-8000-${String(mockIdSequence).padStart(12, "0")}`;
  },
}));

// Metro maps this specifier to `src/sync/reactNativeWebcrypto.ts`; the suite
// serves the same three members from Node so lib0 can load under Jest too.
jest.mock(
  "isomorphic-webcrypto/src/react-native",
  () => ({
    __esModule: true,
    default: {
      ensureSecure: () => undefined,
      getRandomValues: (values: Uint8Array) =>
        (jest.requireActual("node:crypto") as typeof import("node:crypto")).webcrypto.getRandomValues(values),
      subtle: undefined,
    },
  }),
  { virtual: true },
);

// Both replace native modules with the equivalent JavaScript implementation.
jest.mock("expo-sqlite", () => jest.requireActual("./tests/support/sqlite"));
jest.mock("react-native-libsodium", () => {
  const sodium = jest.requireActual("libsodium-wrappers-sumo") as Record<string, unknown>;
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "__esModule") return true;
        if (property === "default") return sodium;
        return sodium[property as string];
      },
      has: () => true,
    },
  );
});
