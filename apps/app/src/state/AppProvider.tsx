import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { createId } from "@/platform/ids";
import { EMPTY_SNAPSHOT, type AppSnapshot, type VaultSession } from "@/state/snapshot";
import { agreementPair, initializeCrypto } from "@/infrastructure/crypto/nativeCrypto";
import {
  deleteEncryptedDatabase,
  openEncryptedDatabase,
} from "@/infrastructure/database/openDatabase";
import { VaultRepository } from "@/infrastructure/database/repository";
import {
  clearAccessLockSettings,
  clearQuickPin,
  createQuickPin,
  DEFAULT_LOCK_TIMEOUT_MS,
  hasQuickPin,
  loadLockTimeout,
  saveLockTimeout,
  verifyQuickPin,
} from "@/infrastructure/secure-storage/accessLock";
import {
  clearKeyMaterial,
  clearLocalKeys,
  createLocalKeys,
  hasLocalVault,
  loadLocalKeys,
  saveVaultKeys,
  type VaultKeys,
} from "@/infrastructure/secure-storage/keyStore";
import {
  clearSyncConfiguration,
  enrollDevice,
  loadSyncConfiguration,
  saveSyncConfiguration,
  type SyncConfiguration,
} from "@/infrastructure/sync/syncClient";
import { nativeCryptoProvider } from "@/sync/cryptoProvider";
import { deviceFingerprint } from "@/sync/deviceIdentity";
import { claimVaultAccess } from "@/sync/deviceLink";
import { createSyncEngine, type SyncOutcome } from "@/sync/engine";
import {
  clearVaultWrapper,
  createPassphraseWrapper,
  createRecoveryCode,
  hasVaultWrapper,
  verifyPassphrase,
} from "@/infrastructure/secure-storage/vaultWrapper";

type UnlockMethod = "passphrase" | "pin";

/** What the joining device shows while a trusted device decides about it. */
export interface PendingJoin {
  vaultId: string;
  deviceId: string;
  fingerprint: string;
}

interface AppContextValue {
  phase: "booting" | "onboarding" | "locked" | "ready" | "error";
  error: string | null;
  actionError: string | null;
  snapshot: AppSnapshot;
  repository: VaultRepository | null;
  session: VaultSession | null;
  pinEnabled: boolean;
  lockTimeoutMs: number;
  createVault(passphrase: string, pin?: string): Promise<VaultSession>;
  beginJoin(input: {
    server: SyncConfiguration;
    vaultId: string;
    passphrase: string;
    deviceName?: string;
  }): Promise<PendingJoin>;
  /** `false` while the trusted device has not approved this one yet. */
  completeJoin(): Promise<boolean>;
  cancelJoin(): Promise<void>;
  syncNow(): Promise<SyncOutcome>;
  unlock(credential: string, method?: UnlockMethod): Promise<void>;
  setQuickPin(pin: string | null): Promise<void>;
  setLockTimeout(timeoutMs: number): Promise<void>;
  clearActionError(): void;
  lock(): Promise<void>;
  wipe(): Promise<void>;
  refresh(): Promise<void>;
  run<T>(action: (repository: VaultRepository) => Promise<T>): Promise<T>;
}

const AppContext = createContext<AppContextValue | null>(null);

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

async function stage<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    const detail = errorMessage(cause, String(cause));
    console.error(`[giraffle:setup] ${name} failed:`, cause);
    throw new Error(`${name}: ${detail}`);
  }
}

export function AppProvider({ children }: PropsWithChildren) {
  const [phase, setPhase] = useState<AppContextValue["phase"]>("booting");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(EMPTY_SNAPSHOT);
  const [repository, setRepository] = useState<VaultRepository | null>(null);
  const [session, setSession] = useState<VaultSession | null>(null);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [lockTimeoutMs, setLockTimeoutMs] = useState(DEFAULT_LOCK_TIMEOUT_MS);
  const keyRef = useRef<{
    databaseKey: Uint8Array;
    vaultKeys: VaultKeys;
  } | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const pinFailures = useRef(0);
  const pinBlockedUntil = useRef(0);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const joinRef = useRef<
    (PendingJoin & { keys: { databaseKey: Uint8Array; vaultKeys: VaultKeys }; passphrase: string }) | null
  >(null);
  const engineRef = useRef<ReturnType<typeof createSyncEngine> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await initializeCrypto();
        // Keys survive an uninstall in the keychain, the wrapper does not:
        // a vault counts as present only when both halves are there.
        const [hasKeys, hasWrapper, hasPin, timeout] = await Promise.all([
          hasLocalVault(),
          hasVaultWrapper(),
          hasQuickPin(),
          loadLockTimeout(),
        ]);
        const exists = hasKeys && hasWrapper;
        if (!exists) {
          await Promise.all([
            clearLocalKeys(),
            clearVaultWrapper(),
            clearAccessLockSettings(),
            clearSyncConfiguration(),
            deleteEncryptedDatabase(),
          ]);
        }
        if (!active) return;
        setPinEnabled(exists && hasPin);
        setLockTimeoutMs(exists ? timeout : DEFAULT_LOCK_TIMEOUT_MS);
        setPhase(exists ? "locked" : "onboarding");
      } catch (cause) {
        if (!active) return;
        setError(errorMessage(cause, "Startup failed"));
        setPhase("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const close = useCallback(async () => {
    await mutationQueue.current;
    try {
      if (repository) await repository.close();
    } finally {
      if (keyRef.current) clearKeyMaterial(keyRef.current);
      keyRef.current = null;
      engineRef.current = null;
      mutationQueue.current = Promise.resolve();
      setRepository(null);
      setSession(null);
      setSnapshot(EMPTY_SNAPSHOT);
    }
  }, [repository]);

  const lock = useCallback(async () => {
    setPhase("locked");
    await close().catch(() => undefined);
  }, [close]);

  useEffect(() => {
    const listener = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        backgroundAt.current ??= Date.now();
        return;
      }
      if (next !== "active") return;

      const leftAt = backgroundAt.current;
      backgroundAt.current = null;
      if (
        phase === "ready" &&
        leftAt !== null &&
        lockTimeoutMs >= 0 &&
        Date.now() - leftAt >= lockTimeoutMs
      ) {
        void lock();
      }
    };
    const subscription = AppState.addEventListener("change", listener);
    return () => subscription.remove();
  }, [lock, lockTimeoutMs, phase]);

  const connect = useCallback(
    async (
      keys: { databaseKey: Uint8Array; vaultKeys: VaultKeys },
      vaultId: string,
      deviceId: string,
      recoveryCode?: string,
    ) => {
      const database = await stage("open-database", () =>
        openEncryptedDatabase(keys.databaseKey),
      );
      const next = new VaultRepository({
        database,
        vaultId,
        deviceId,
        keys: keys.vaultKeys,
      });
      try {
        await stage("repository-initialize", () => next.initialize());
        const nextSnapshot = await stage("repository-snapshot", () =>
          next.snapshot(),
        );
        keyRef.current = keys;
        setRepository(next);
        setSession({
          vaultId,
          deviceId,
          ...(recoveryCode ? { recoveryCode } : {}),
        });
        setSnapshot(nextSnapshot);
        setActionError(null);
        setPhase("ready");
      } catch (cause) {
        await database.closeAsync().catch(() => undefined);
        throw cause;
      }
    },
    [],
  );

  const createVault = useCallback(
    async (passphrase: string, pin?: string) => {
      if (passphrase.length < 12) {
        throw new Error("Use at least 12 characters");
      }
      const keys = await stage("create-local-keys", () => createLocalKeys());
      try {
        const vaultId = createId();
        const deviceId = createId();
        const recovery = createRecoveryCode();
        recovery.secret.fill(0);
        await stage("passphrase-wrapper", () =>
          createPassphraseWrapper(vaultId, passphrase, keys.vaultKeys.vaultRootKey),
        );
        if (pin) {
          await stage("quick-pin", () =>
            createQuickPin(vaultId, pin, keys.vaultKeys.vaultRootKey),
          );
          setPinEnabled(true);
        }
        await connect(keys, vaultId, deviceId, recovery.code);
        return { vaultId, deviceId, recoveryCode: recovery.code };
      } catch (cause) {
        clearKeyMaterial(keys);
        await Promise.allSettled([
          clearLocalKeys(),
          clearVaultWrapper(),
          clearAccessLockSettings(),
          deleteEncryptedDatabase(),
        ]);
        throw cause;
      }
    },
    [connect],
  );

  /**
   * Publishes this device's public keys and stops. Nothing is decrypted and no
   * vault key exists here yet: the device is inert until a trusted one seals the
   * vault secrets to the exact keys whose fingerprint the human just compared.
   */
  const beginJoin = useCallback<AppContextValue["beginJoin"]>(
    async ({ server, vaultId, passphrase, deviceName }) => {
      if (passphrase.length < 12) throw new Error("Use at least 12 characters");

      const keys = await stage("create-local-keys", () => createLocalKeys());
      try {
        const deviceId = createId();
        await stage("save-connection", () => saveSyncConfiguration(server));

        const database = await stage("open-database", () =>
          openEncryptedDatabase(keys.databaseKey),
        );
        const repository = new VaultRepository({
          database,
          vaultId,
          deviceId,
          keys: keys.vaultKeys,
        });
        await stage("repository-initialize", () => repository.initialize());
        await stage("device-enrollment", () =>
          enrollDevice(server, { vaultId, deviceId, repository, ...(deviceName ? { name: deviceName } : {}) }),
        );
        await database.closeAsync().catch(() => undefined);

        const pending: PendingJoin = {
          vaultId,
          deviceId,
          fingerprint: deviceFingerprint(nativeCryptoProvider, repository.deviceIdentity()),
        };
        joinRef.current = { ...pending, keys, passphrase };
        return pending;
      } catch (cause) {
        clearKeyMaterial(keys);
        await Promise.allSettled([clearLocalKeys(), clearSyncConfiguration(), deleteEncryptedDatabase()]);
        throw cause;
      }
    },
    [],
  );

  const completeJoin = useCallback(async () => {
    const join = joinRef.current;
    if (!join) throw new Error("No device is waiting to join");

    const server = await loadSyncConfiguration();
    if (!server) throw new Error("The saved connection could not be read");

    const claimed = await claimVaultAccess(server, {
      vaultId: join.vaultId,
      deviceId: join.deviceId,
      agreementKeys: agreementPair(join.keys.vaultKeys.agreementSeed),
    });
    if (!claimed) return false;

    // The locally generated placeholders are replaced by the vault's real keys;
    // the device identity seeds stay as they are, because they are this device's.
    const vaultKeys: VaultKeys = { ...join.keys.vaultKeys, ...claimed.secrets };
    await saveVaultKeys(vaultKeys);
    await createPassphraseWrapper(join.vaultId, join.passphrase, vaultKeys.vaultRootKey);

    joinRef.current = null;
    await connect({ databaseKey: join.keys.databaseKey, vaultKeys }, join.vaultId, join.deviceId);
    return true;
  }, [connect]);

  const cancelJoin = useCallback(async () => {
    const join = joinRef.current;
    joinRef.current = null;
    if (join) clearKeyMaterial(join.keys);
    await Promise.allSettled([
      clearLocalKeys(),
      clearVaultWrapper(),
      clearSyncConfiguration(),
      deleteEncryptedDatabase(),
    ]);
  }, []);

  const syncNow = useCallback(async () => {
    if (!repository || !session) throw new Error("Vault is locked");
    const server = await loadSyncConfiguration();
    if (!server) throw new Error("Save a connection first");

    engineRef.current ??= createSyncEngine({
      config: server,
      vaultId: session.vaultId,
      deviceId: session.deviceId,
      repository,
    });
    const outcome = await engineRef.current.run();
    setSnapshot(await repository.snapshot());
    return outcome;
  }, [repository, session]);

  const unlock = useCallback(
    async (credential: string, method: UnlockMethod = "passphrase") => {
      setError(null);
      if (method === "pin" && Date.now() < pinBlockedUntil.current) {
        throw new Error("Quick PIN is temporarily unavailable");
      }
      const keys = await loadLocalKeys();
      if (!keys) throw new Error("Secure vault keys are unavailable");

      try {
        const verified =
          method === "pin"
            ? await verifyQuickPin(credential, keys.vaultKeys.vaultRootKey)
            : await verifyPassphrase(credential, keys.vaultKeys.vaultRootKey);
        if (!verified) {
          if (method === "pin") {
            pinFailures.current += 1;
            if (pinFailures.current >= 5) {
              pinFailures.current = 0;
              pinBlockedUntil.current = Date.now() + 30_000;
            }
          }
          throw new Error(
            method === "pin"
              ? "PIN did not unlock this vault"
              : "Passphrase did not unlock this vault",
          );
        }
        pinFailures.current = 0;
        pinBlockedUntil.current = 0;

        const database = await openEncryptedDatabase(keys.databaseKey);
        let metadata: { id: string; device_id: string } | null = null;
        try {
          metadata = await database.getFirstAsync<{ id: string; device_id: string }>(
            "SELECT id,device_id FROM vault_metadata LIMIT 1",
          );
        } finally {
          await database.closeAsync().catch(() => undefined);
        }
        if (!metadata) throw new Error("Vault metadata is missing");
        await connect(keys, metadata.id, metadata.device_id);
      } catch (cause) {
        if (keyRef.current !== keys) clearKeyMaterial(keys);
        throw cause;
      }
    },
    [connect],
  );

  const setQuickPin = useCallback(
    async (pin: string | null) => {
      if (!pin) {
        await clearQuickPin();
        setPinEnabled(false);
        return;
      }
      if (!keyRef.current || !session) throw new Error("Vault is locked");
      await createQuickPin(
        session.vaultId,
        pin,
        keyRef.current.vaultKeys.vaultRootKey,
      );
      setPinEnabled(true);
    },
    [session],
  );

  const setLockTimeout = useCallback(async (timeoutMs: number) => {
    await saveLockTimeout(timeoutMs);
    setLockTimeoutMs(timeoutMs);
  }, []);

  const refresh = useCallback(async () => {
    if (repository) setSnapshot(await repository.snapshot());
  }, [repository]);

  const run = useCallback(
    <T,>(action: (value: VaultRepository) => Promise<T>): Promise<T> => {
      if (!repository) return Promise.reject(new Error("Vault is locked"));

      const execute = async () => {
        let result: T;
        try {
          result = await action(repository);
        } catch (cause) {
          setActionError(errorMessage(cause, "The change could not be saved"));
          throw cause;
        }
        try {
          setSnapshot(await repository.snapshot());
          setActionError(null);
        } catch {
          setActionError("The change was saved, but the screen could not be refreshed.");
        }
        return result;
      };
      const result = mutationQueue.current.then(execute, execute);
      mutationQueue.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [repository],
  );

  const wipe = useCallback(async () => {
    setPhase("booting");
    await close().catch(() => undefined);
    const cleanup = await Promise.allSettled([
      clearLocalKeys(),
      clearVaultWrapper(),
      clearAccessLockSettings(),
      clearSyncConfiguration(),
      deleteEncryptedDatabase(),
    ]);
    setPinEnabled(false);
    setLockTimeoutMs(DEFAULT_LOCK_TIMEOUT_MS);
    setSnapshot(EMPTY_SNAPSHOT);
    if (cleanup.some((result) => result.status === "rejected")) {
      setError("Some device storage could not be cleared. Restart Giraffle before creating a new vault.");
      setPhase("error");
    } else {
      setError(null);
      setActionError(null);
      setPhase("onboarding");
    }
  }, [close]);

  const value: AppContextValue = {
    phase,
    error,
    actionError,
    snapshot,
    repository,
    session,
    pinEnabled,
    lockTimeoutMs,
    createVault,
    beginJoin,
    completeJoin,
    cancelJoin,
    syncNow,
    unlock,
    setQuickPin,
    setLockTimeout,
    clearActionError: () => setActionError(null),
    lock,
    wipe,
    refresh,
    run,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
