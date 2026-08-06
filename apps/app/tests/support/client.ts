import { ready, randombytes_buf } from "react-native-libsodium";
import { runMigrations } from "@/infrastructure/database/openDatabase";
import { VaultRepository } from "@/infrastructure/database/repository";
import type { VaultKeys } from "@/infrastructure/secure-storage/keyStore";
import type { SyncConfiguration } from "@/infrastructure/sync/syncClient";
import { createSyncEngine, type SyncOutcome } from "@/sync/engine";
import { openDatabaseAsync, type TestDatabase } from "./sqlite";

export const VAULT_ID = "vault-under-test";
export const SYNC_CONFIG: SyncConfiguration = {
  baseUrl: "https://relay.test",
  token: "test-token-0000000000000000000000000000",
};

export interface TestClient {
  deviceId: string;
  database: TestDatabase;
  repository: VaultRepository;
  keys: VaultKeys;
  sync(): Promise<SyncOutcome>;
  /** Rebuilds the repository over the same storage, as a restart would. */
  restart(): Promise<TestClient>;
}

/** The three vault-wide secrets every device in a vault shares. */
export async function createVaultSecrets(): Promise<Pick<VaultKeys, "vaultRootKey" | "contentKey" | "locatorKey">> {
  await ready;
  return {
    vaultRootKey: randombytes_buf(32),
    contentKey: randombytes_buf(32),
    locatorKey: randombytes_buf(32),
  };
}

export async function createClient(input: {
  deviceId: string;
  secrets: Pick<VaultKeys, "vaultRootKey" | "contentKey" | "locatorKey">;
  vaultId?: string;
}): Promise<TestClient> {
  await ready;
  const vaultId = input.vaultId ?? VAULT_ID;
  const database = await openDatabaseAsync(`vault-${input.deviceId}`);
  await database.execAsync("PRAGMA foreign_keys = ON");
  await runMigrations(database as never);

  // Identity keys are per device; only the vault secrets are shared.
  const keys: VaultKeys = {
    ...input.secrets,
    signingSeed: randombytes_buf(32),
    agreementSeed: randombytes_buf(32),
  };

  const build = async (): Promise<TestClient> => {
    const repository = new VaultRepository({
      database: database as never,
      vaultId,
      deviceId: input.deviceId,
      keys,
    });
    await repository.initialize();

    const engine = createSyncEngine({
      config: SYNC_CONFIG,
      vaultId,
      deviceId: input.deviceId,
      repository,
    });

    return {
      deviceId: input.deviceId,
      database,
      repository,
      keys,
      sync: () => engine.run(),
      restart: build,
    };
  };

  return build();
}

export async function pageTitles(client: TestClient): Promise<string[]> {
  const snapshot = await client.repository.snapshot();
  return snapshot.pages.map((page) => page.title).sort();
}

export async function findPage(client: TestClient, id: string) {
  const snapshot = await client.repository.snapshot();
  return snapshot.pages.find((page) => page.id === id);
}
