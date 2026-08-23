import * as SecureStore from "expo-secure-store";
import {
  forgetUnlockedSession,
  rememberUnlockedSession,
  restoreUnlockedSession,
} from "@/infrastructure/secure-storage/unlockedSession";
import type { LocalKeys } from "@/infrastructure/secure-storage/vaultKeys.contract";

jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    __clear: () => values.clear(),
  };
});

const secureStore = SecureStore as typeof SecureStore & { __clear(): void };

function keys(): LocalKeys {
  const key = (start: number) =>
    Uint8Array.from({ length: 32 }, (_, index) => start + index);
  return {
    databaseKey: key(1),
    vaultKeys: {
      vaultRootKey: key(11),
      contentKey: key(21),
      locatorKey: key(31),
      signingSeed: key(41),
      agreementSeed: key(51),
    },
  };
}

describe("native unlocked session", () => {
  beforeEach(() => {
    secureStore.__clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("restores the vault after a process restart within the lock timeout", async () => {
    const original = keys();
    const expected = keys();
    await rememberUnlockedSession(original, Date.now() + 24 * 60 * 60_000);

    original.databaseKey.fill(0);
    Object.values(original.vaultKeys).forEach((value) => value.fill(0));

    expect(await restoreUnlockedSession()).toEqual(expected);
  });

  test("does not restore the vault after the lock timeout", async () => {
    await rememberUnlockedSession(keys(), Date.now() + 60_000);
    jest.advanceTimersByTime(60_000);

    expect(await restoreUnlockedSession()).toBeNull();
    expect(await restoreUnlockedSession()).toBeNull();
  });

  test("explicit locking revokes the remembered session", async () => {
    await rememberUnlockedSession(keys(), Date.now() + 24 * 60 * 60_000);
    await forgetUnlockedSession();

    expect(await restoreUnlockedSession()).toBeNull();
  });
});
