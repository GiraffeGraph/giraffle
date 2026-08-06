import * as SecureStore from "expo-secure-store";
import type { VaultRepository } from "../database/repository";
import { decodeKey, encodeKey } from "../secure-storage/keyStore";

const SERVER_KEY = "giraffle.sync-server.v1";
const TOKEN_KEY = "giraffle.sync-token.v1";
const REQUEST_TIMEOUT_MS = 20_000;
const DEVICE_HEADER = "X-Giraffle-Device-Id";
const MAX_PULL_LIMIT = 100;
const DECIMAL = /^\d+$/;

export interface SyncConfiguration {
  baseUrl: string;
  token: string;
}

export type DeviceStatus = "pending" | "active" | "revoked";

export interface RemoteDevice {
  deviceId: string;
  name: string;
  status: DeviceStatus;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  enrolledAt: number;
  approvedByDeviceId: string | null;
}

export interface PulledPage {
  records: { serverSeq: string; encodedRecord: Uint8Array }[];
  nextCursor: string;
  hasMore: boolean;
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

const headers = (token: string, deviceId?: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  ...(deviceId ? { [DEVICE_HEADER]: deviceId } : {}),
});

const vaultUrl = (config: SyncConfiguration, vaultId: string) =>
  `${config.baseUrl}/api/v1/vaults/${encodeURIComponent(vaultId)}`;

async function readJson(response: Response, label: string): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The sync server returned an invalid ${label}`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`The sync server returned an invalid ${label}`);
  }
  return payload as Record<string, unknown>;
}

export async function enrollDevice(
  config: SyncConfiguration,
  input: { vaultId: string; deviceId: string; name?: string; repository: VaultRepository },
): Promise<DeviceStatus> {
  const keys = input.repository.deviceEnrollment();
  const response = await request(`${vaultUrl(config, input.vaultId)}/devices`, {
    method: "POST",
    headers: headers(config.token),
    body: JSON.stringify({
      deviceId: input.deviceId,
      name: input.name ?? "Giraffle mobile",
      signingPublicKey: encodeKey(keys.signingPublicKey),
      agreementPublicKey: encodeKey(keys.agreementPublicKey),
      protocolVersion: 1,
    }),
  });
  if (!response.ok) throw new Error(`Device enrollment failed (${response.status})`);

  const status = (await readJson(response, "enrollment receipt")).status;
  if (status !== "pending" && status !== "active" && status !== "revoked") {
    throw new Error("The sync server returned an invalid enrollment receipt");
  }
  return status;
}

export async function listDevices(
  config: SyncConfiguration,
  vaultId: string,
): Promise<RemoteDevice[]> {
  const response = await request(`${vaultUrl(config, vaultId)}/devices`, {
    headers: headers(config.token),
  });
  if (!response.ok) throw new Error(`The device list could not be read (${response.status})`);

  const devices = (await readJson(response, "device list")).devices;
  if (!Array.isArray(devices)) throw new Error("The sync server returned an invalid device list");

  return devices.map((entry) => {
    const device = entry as Record<string, unknown>;
    if (
      typeof device.deviceId !== "string" ||
      typeof device.name !== "string" ||
      typeof device.status !== "string" ||
      typeof device.signingPublicKey !== "string" ||
      typeof device.agreementPublicKey !== "string"
    ) {
      throw new Error("The sync server returned an invalid device list");
    }
    return {
      deviceId: device.deviceId,
      name: device.name,
      status: device.status as DeviceStatus,
      signingPublicKey: decodeKey(device.signingPublicKey),
      agreementPublicKey: decodeKey(device.agreementPublicKey),
      enrolledAt: typeof device.enrolledAt === "number" ? device.enrolledAt : 0,
      approvedByDeviceId:
        typeof device.approvedByDeviceId === "string" ? device.approvedByDeviceId : null,
    };
  });
}

/** Posts a signed approval or revocation; the action lives inside the statement. */
export async function authorizeDevice(
  config: SyncConfiguration,
  input: {
    vaultId: string;
    subjectDeviceId: string;
    statement: Uint8Array;
    signature: Uint8Array;
    grant?: Uint8Array;
  },
): Promise<DeviceStatus> {
  const response = await request(
    `${vaultUrl(config, input.vaultId)}/devices/${encodeURIComponent(input.subjectDeviceId)}/authorization`,
    {
      method: "POST",
      headers: headers(config.token),
      body: JSON.stringify({
        statement: encodeKey(input.statement),
        signature: encodeKey(input.signature),
        ...(input.grant ? { grant: encodeKey(input.grant) } : {}),
      }),
    },
  );

  const payload = await readJson(response, "authorization receipt");
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : `Authorization failed (${response.status})`,
    );
  }
  return payload.status as DeviceStatus;
}

export async function fetchDeviceGrant(
  config: SyncConfiguration,
  input: { vaultId: string; deviceId: string },
): Promise<{ status: DeviceStatus; grant: Uint8Array | null; approvedByDeviceId: string | null }> {
  const response = await request(
    `${vaultUrl(config, input.vaultId)}/devices/${encodeURIComponent(input.deviceId)}/grant`,
    { headers: headers(config.token) },
  );
  if (!response.ok) throw new Error(`This device is not enrolled yet (${response.status})`);

  const payload = await readJson(response, "grant receipt");
  return {
    status: payload.status as DeviceStatus,
    grant: typeof payload.grant === "string" ? decodeKey(payload.grant) : null,
    approvedByDeviceId:
      typeof payload.approvedByDeviceId === "string" ? payload.approvedByDeviceId : null,
  };
}

export async function pushOutbox(
  config: SyncConfiguration,
  input: { vaultId: string; repository: VaultRepository },
): Promise<number> {
  const records = await input.repository.pendingRecords();
  if (!records.length) return 0;

  const response = await request(`${vaultUrl(config, input.vaultId)}/sync/push`, {
    method: "POST",
    headers: headers(config.token, input.repository.deviceIdentity().deviceId),
    body: JSON.stringify({ records: records.map((item) => encodeKey(item.record)) }),
  });
  if (!response.ok) throw new Error(`Ciphertext push failed (${response.status})`);

  const accepted = (await readJson(response, "receipt")).accepted;
  if (!Array.isArray(accepted) || accepted.some((value) => typeof value !== "string")) {
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

/**
 * Reads one page of ciphertext from the relay. The caller owns the cursor loop,
 * because only it knows whether the records it just received were durably
 * applied; advancing here would lose records on a mid-page failure.
 */
export async function pullRecords(
  config: SyncConfiguration,
  input: { vaultId: string; deviceId: string; after: string; limit?: number },
): Promise<PulledPage> {
  const after = DECIMAL.test(input.after) ? input.after : "0";
  const limit = Math.min(Math.max(input.limit ?? MAX_PULL_LIMIT, 1), MAX_PULL_LIMIT);

  const response = await request(
    `${vaultUrl(config, input.vaultId)}/sync/pull?after=${after}&limit=${limit}`,
    { headers: headers(config.token, input.deviceId) },
  );
  if (!response.ok) throw new Error(`Ciphertext pull failed (${response.status})`);

  const payload = await readJson(response, "page of changes");
  const entries = payload.records;
  if (
    !Array.isArray(entries) ||
    entries.length > limit ||
    typeof payload.nextCursor !== "string" ||
    !DECIMAL.test(payload.nextCursor) ||
    typeof payload.hasMore !== "boolean"
  ) {
    throw new Error("The sync server returned an invalid page of changes");
  }

  const records = entries.map((entry) => {
    const record = entry as Record<string, unknown>;
    if (
      typeof record.serverSeq !== "string" ||
      !DECIMAL.test(record.serverSeq) ||
      typeof record.encodedRecord !== "string"
    ) {
      throw new Error("The sync server returned an invalid page of changes");
    }
    return { serverSeq: record.serverSeq, encodedRecord: decodeKey(record.encodedRecord) };
  });

  // The relay orders strictly by sequence; anything else means the page was
  // reordered in transit and applying it could skip a record.
  for (let index = 1; index < records.length; index += 1) {
    if (Number(records[index]!.serverSeq) <= Number(records[index - 1]!.serverSeq)) {
      throw new Error("The sync server returned an invalid page of changes");
    }
  }

  return { records, nextCursor: payload.nextCursor, hasMore: payload.hasMore };
}
