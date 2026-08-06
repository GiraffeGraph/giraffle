import * as SecureStore from "expo-secure-store";
import type { VaultRepository } from "../database/repository";
import { encodeKey } from "../secure-storage/keyStore";

const SERVER_KEY = "giraffle.sync-server.v1";
const TOKEN_KEY = "giraffle.sync-token.v1";
const REQUEST_TIMEOUT_MS = 20_000;

export interface SyncConfiguration {
  baseUrl: string;
  token: string;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error("The sync server did not respond in time");
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveSyncConfiguration(value: SyncConfiguration): Promise<void> {
  const baseUrl = value.baseUrl.trim().replace(/\/+$/, "");
  const token = value.token.trim();
  if (!baseUrl || !token) throw new Error("Server address and connection code are required");
  await Promise.all([
    SecureStore.setItemAsync(SERVER_KEY, baseUrl),
    SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  ]);
}

export async function loadSyncConfiguration(): Promise<SyncConfiguration | null> {
  const [baseUrl, token] = await Promise.all([
    SecureStore.getItemAsync(SERVER_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return baseUrl && token ? { baseUrl, token } : null;
}

export async function clearSyncConfiguration(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SERVER_KEY),
    SecureStore.deleteItemAsync(TOKEN_KEY),
  ]);
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function enrollDevice(
  config: SyncConfiguration,
  input: { vaultId: string; deviceId: string; repository: VaultRepository },
): Promise<void> {
  const keys = input.repository.deviceEnrollment();
  const response = await request(
    `${config.baseUrl}/api/v1/vaults/${encodeURIComponent(input.vaultId)}/devices`,
    {
      method: "POST",
      headers: headers(config.token),
      body: JSON.stringify({
        deviceId: input.deviceId,
        name: "Giraffle mobile",
        signingPublicKey: encodeKey(keys.signingPublicKey),
        agreementPublicKey: encodeKey(keys.agreementPublicKey),
        protocolVersion: 1,
      }),
    },
  );
  if (!response.ok) throw new Error(`Device enrollment failed (${response.status})`);
}

export async function pushOutbox(
  config: SyncConfiguration,
  input: { vaultId: string; repository: VaultRepository },
): Promise<number> {
  const records = await input.repository.pendingRecords();
  if (!records.length) return 0;

  const response = await request(
    `${config.baseUrl}/api/v1/vaults/${encodeURIComponent(input.vaultId)}/sync/push`,
    {
      method: "POST",
      headers: headers(config.token),
      body: JSON.stringify({ records: records.map((item) => encodeKey(item.record)) }),
    },
  );
  if (!response.ok) throw new Error(`Ciphertext push failed (${response.status})`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The sync server returned an invalid receipt");
  }
  const accepted =
    payload && typeof payload === "object" && Array.isArray((payload as { accepted?: unknown }).accepted)
      ? (payload as { accepted: unknown[] }).accepted
      : null;
  if (!accepted || accepted.some((value) => typeof value !== "string")) {
    throw new Error("The sync server returned an invalid receipt");
  }

  const expectedIds = new Set(records.map((item) => item.record_id));
  const acceptedIds = accepted as string[];
  if (
    acceptedIds.length !== expectedIds.size ||
    acceptedIds.some((recordId) => !expectedIds.has(recordId)) ||
    new Set(acceptedIds).size !== acceptedIds.length
  ) {
    throw new Error("The sync server returned an incomplete receipt");
  }

  await input.repository.markPushed(acceptedIds);
  return acceptedIds.length;
}
