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
import { installHeadlessBridge } from "@/headless/bridge";
import { createId } from "@/platform/ids";
import {
  createVaultArchive,
  openVaultArchive,
  summarizeVaultArchive,
  type VaultArchiveSummary,
} from "@/infrastructure/archive/vaultArchive";
import { EMPTY_SNAPSHOT, type AppSnapshot, type VaultSession } from "@/state/snapshot";
import { agreementPair } from "@/infrastructure/crypto/vaultCrypto";
import {
  deleteEncryptedDatabase,
  openEncryptedDatabase,
} from "@/infrastructure/database/openDatabase";
import { VaultRepository } from "@/infrastructure/database/repository";
import {
  clearLockTimeout,
  DEFAULT_LOCK_TIMEOUT_MS,
  loadLockTimeout,
  saveLockTimeout,
} from "@/infrastructure/secure-storage/lockTimeout";
import { createRecoveryCode } from "@/infrastructure/secure-storage/recoveryCode";
import {
  forgetUnlockedSession,
  rememberUnlockedSession,
  restoreUnlockedSession,
} from "@/infrastructure/secure-storage/unlockedSession";
import {
  clearKeyMaterial,
  clearLocalKeys,
  clearQuickPin,
  clearVaultWrapper,
  createLocalKeys,
  createPassphraseWrapper,
  createQuickPin,
  hasLocalVault,
  hasQuickPin,
  hasVaultWrapper,
  saveVaultKeys,
  unlockLocalKeys,
  type LocalKeys,
  type VaultKeys,
} from "@/infrastructure/secure-storage/vaultKeys";
import {
  clearSyncConfiguration,
  enrollDevice,
  loadSyncConfiguration,
  saveSyncConfiguration,
  type SyncConfiguration,
} from "@/infrastructure/sync/syncClient";
import { initializeCrypto, vaultCryptoProvider } from "@/sync/cryptoProvider";
import { deviceFingerprint } from "@/sync/deviceIdentity";
import { claimVaultAccess } from "@/sync/deviceLink";
import { createSyncEngine, type SyncOutcome } from "@/sync/engine";

type UnlockMethod = "passphrase" | "pin";

const AUTO_SYNC_INTERVAL_MS = 5_000;

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
  createBackup(passphrase: string): Promise<Uint8Array>;
  inspectBackup(bytes: Uint8Array, passphrase: string): Promise<VaultArchiveSummary>;
  restoreBackup(bytes: Uint8Array, passphrase: string): Promise<VaultArchiveSummary>;
  run<T>(action: (repository: VaultRepository) => Promise<T>): Promise<T>;
}

const AppContext = createContext<AppContextValue | null>(null);

async function clearAccessLock(): Promise<void> {
  await Promise.all([
    clearQuickPin(),
    clearLockTimeout(),
    forgetUnlockedSession(),
  ]);
}

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
  const repositoryRef = useRef<VaultRepository | null>(null);
  const [session, setSession] = useState<VaultSession | null>(null);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [lockTimeoutMs, setLockTimeoutMs] = useState(DEFAULT_LOCK_TIMEOUT_MS);
  const keyRef = useRef<LocalKeys | null>(null);
  const lockTimeoutRef = useRef(DEFAULT_LOCK_TIMEOUT_MS);
  const backgroundAt = useRef<number | null>(null);
  const pinFailures = useRef(0);
  const pinBlockedUntil = useRef(0);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const joinRef = useRef<
    (PendingJoin & { keys: LocalKeys; passphrase: string }) | null
  >(null);
  const syncInFlightRef = useRef<Promise<SyncOutcome> | null>(null);
  const enrolledConnectionRef = useRef<string | null>(null);

  const sessionExpiry = useCallback(
    () =>
      lockTimeoutRef.current < 0
        ? Number.MAX_SAFE_INTEGER
        : Date.now() + lockTimeoutRef.current,
    [],
  );


  const close = useCallback(async () => {
    await mutationQueue.current;
    const syncing = syncInFlightRef.current;
    if (syncing) await syncing.catch(() => undefined);
    try {
      if (repository) await repository.close();
    } finally {
      if (keyRef.current) clearKeyMaterial(keyRef.current);
      keyRef.current = null;
      if (syncInFlightRef.current === syncing) syncInFlightRef.current = null;
      enrolledConnectionRef.current = null;
      mutationQueue.current = Promise.resolve();
      repositoryRef.current = null;
      setRepository(null);
      setSession(null);
      setSnapshot(EMPTY_SNAPSHOT);
    }
  }, [repository]);

  const lock = useCallback(async () => {
    setPhase("locked");
    await forgetUnlockedSession().catch(() => undefined);
    await close().catch(() => undefined);
  }, [close]);

  useEffect(() => {
    const listener = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        backgroundAt.current ??= Date.now();
        if (keyRef.current) {
          void rememberUnlockedSession(keyRef.current, sessionExpiry()).catch(
            () => undefined,
          );
        }
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
  }, [lock, lockTimeoutMs, phase, sessionExpiry]);

  const connect = useCallback(
    async (
      keys: LocalKeys,
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
        repositoryRef.current = next;
        setRepository(next);
        setSession({
          vaultId,
          deviceId,
          ...(recoveryCode ? { recoveryCode } : {}),
        });
        setSnapshot(nextSnapshot);
        setActionError(null);
        setPhase("ready");
        await rememberUnlockedSession(keys, sessionExpiry()).catch(() => undefined);
      } catch (cause) {
        await database.closeAsync().catch(() => undefined);
        throw cause;
      }
    },
    [sessionExpiry],
  );

  const openWithKeys = useCallback(
    async (keys: LocalKeys) => {
      try {
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
            clearAccessLock(),
            clearSyncConfiguration(),
            deleteEncryptedDatabase(),
          ]);
        }
        if (!active) return;
        setPinEnabled(exists && hasPin);
        setLockTimeoutMs(exists ? timeout : DEFAULT_LOCK_TIMEOUT_MS);
        lockTimeoutRef.current = exists ? timeout : DEFAULT_LOCK_TIMEOUT_MS;

        // A reload is not a lock. Within the timeout the vault reopens itself,
        // which is what the setting promises on every other platform.
        const carried = exists ? await restoreUnlockedSession() : null;
        if (!active) {
          if (carried) clearKeyMaterial(carried);
          return;
        }
        if (carried) {
          try {
            await openWithKeys(carried);
            return;
          } catch {
            clearKeyMaterial(carried);
            await forgetUnlockedSession().catch(() => undefined);
            if (!active) return;
          }
        }
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
  }, [openWithKeys]);

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
          clearAccessLock(),
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
        await stage("prepare-joined-vault", () => repository.prepareForJoinedVault());
        await stage("device-enrollment", () =>
          enrollDevice(server, { vaultId, deviceId, repository, ...(deviceName ? { name: deviceName } : {}) }),
        );
        await database.closeAsync().catch(() => undefined);

        const pending: PendingJoin = {
          vaultId,
          deviceId,
          fingerprint: deviceFingerprint(vaultCryptoProvider, repository.deviceIdentity()),
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
    if (syncInFlightRef.current) return syncInFlightRef.current;

    const operation = (async () => {
      const server = await loadSyncConfiguration();
      if (!server) throw new Error("Save a connection first");

      const connectionId = `${session.vaultId}:${session.deviceId}:${server.baseUrl}:${server.token}`;
      if (enrolledConnectionRef.current !== connectionId) {
        const status = await enrollDevice(server, {
          vaultId: session.vaultId,
          deviceId: session.deviceId,
          repository,
        });
        if (status !== "active") throw new Error("This device is not approved for sync");
        enrolledConnectionRef.current = connectionId;
      }

      const outcome = await createSyncEngine({
        config: server,
        vaultId: session.vaultId,
        deviceId: session.deviceId,
        repository,
      }).run();
      setSnapshot(await repository.snapshot());
      return outcome;
    })();

    syncInFlightRef.current = operation;
    try {
      return await operation;
    } finally {
      if (syncInFlightRef.current === operation) syncInFlightRef.current = null;
    }
  }, [repository, session]);

  // Keep active peers converged without making the user press a sync button.
  // The relay remains blind: this only exchanges signed ciphertext records.
  useEffect(() => {
    if (phase !== "ready" || !repository || !session) return undefined;
    let active = true;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const exchange = () => {
      if (!active || AppState.currentState !== "active") return;
      void syncNow().catch(() => undefined);
    };

    exchange();
    const interval = setInterval(exchange, AUTO_SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      // Let the lock listener run first; if it locks, effect cleanup cancels this.
      resumeTimer = setTimeout(exchange, 250);
    });

    return () => {
      active = false;
      clearInterval(interval);
      if (resumeTimer) clearTimeout(resumeTimer);
      subscription.remove();
    };
  }, [phase, repository, session, syncNow]);

  const unlock = useCallback(
    async (credential: string, method: UnlockMethod = "passphrase") => {
      setError(null);
      if (method === "pin" && Date.now() < pinBlockedUntil.current) {
        throw new Error("Quick PIN is temporarily unavailable");
      }
      const keys = await unlockLocalKeys(credential, method);
      if (!keys) {
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
      await openWithKeys(keys);
    },
    [openWithKeys],
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

  const setLockTimeout = useCallback(
    async (timeoutMs: number) => {
      await saveLockTimeout(timeoutMs);
      setLockTimeoutMs(timeoutMs);
      lockTimeoutRef.current = timeoutMs;
      if (keyRef.current) {
        await rememberUnlockedSession(keyRef.current, sessionExpiry()).catch(
          () => undefined,
        );
      }
    },
    [sessionExpiry],
  );

  const refresh = useCallback(async () => {
    if (repository) setSnapshot(await repository.snapshot());
  }, [repository]);

  const run = useCallback(
    <T,>(action: (value: VaultRepository) => Promise<T>): Promise<T> => {
      const activeRepository = repositoryRef.current;
      if (!activeRepository) return Promise.reject(new Error("Vault is locked"));

      const execute = async () => {
        let result: T;
        try {
          result = await action(activeRepository);
        } catch (cause) {
          setActionError(errorMessage(cause, "The change could not be saved"));
          throw cause;
        }
        try {
          setSnapshot(await activeRepository.snapshot());
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
    [],
  );

  const createBackup = useCallback(async (passphrase: string) => {
    if (!repository || !session) throw new Error("Vault is locked");
    await mutationQueue.current;
    return createVaultArchive(await repository.archiveData(), session.vaultId, passphrase);
  }, [repository, session]);

  const inspectBackup = useCallback(async (bytes: Uint8Array, passphrase: string) => {
    return summarizeVaultArchive(openVaultArchive(bytes, passphrase));
  }, []);

  useEffect(() => installHeadlessBridge({
    repository: () => repositoryRef.current,
    unlock,
    run,
  }), [run, unlock]);

  const restoreBackup = useCallback(async (bytes: Uint8Array, passphrase: string) => {
    await syncInFlightRef.current;
    if (await loadSyncConfiguration()) {
      throw new Error("Disconnect sync before importing a backup");
    }
    const payload = openVaultArchive(bytes, passphrase);
    await run((value) => value.restoreArchive(payload.data));
    return summarizeVaultArchive(payload);
  }, [run]);

  const wipe = useCallback(async () => {
    setPhase("booting");
    await close().catch(() => undefined);
    const cleanup = await Promise.allSettled([
      clearLocalKeys(),
      clearVaultWrapper(),
      clearAccessLock(),
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
    createBackup,
    inspectBackup,
    restoreBackup,
    run,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
