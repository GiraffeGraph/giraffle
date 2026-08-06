import {
  createSodiumCryptoProvider,
  createSyncRecord,
  encodeSignedSyncRecord,
  hashSignedSyncRecord,
  zeroRecordHash,
  type E2eeCryptoProvider,
  type SignedSyncRecordV1,
} from "@giraffle/protocol";
import { createApp } from "../src/app.ts";
import { hashToken } from "../src/routes/auth.ts";
import { resetAllRateLimits } from "../src/rate-limit.ts";
import { openDatabase } from "../src/storage/database.ts";
import { createStore, type Store } from "../src/storage/queries.ts";

export const VAULT_ID = "vault-primary";
export const OTHER_VAULT_ID = "vault-secondary";
export const DEVICE_ID = "device-alpha";
export const TOKEN = "test-token-000000000000000000000000000000";
export const OTHER_TOKEN = "other-token-1111111111111111111111111111";

export interface TestHarness {
  app: ReturnType<typeof createApp>;
  store: Store;
  crypto: E2eeCryptoProvider;
  signingPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  contentKey: Uint8Array;
  locatorKey: Uint8Array;
}

export function encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function createHarness(): Promise<TestHarness> {
  resetAllRateLimits();

  const crypto = await createSodiumCryptoProvider();
  const store = createStore(openDatabase(":memory:"));
  store.replaceAccessTokens([
    { tokenHash: hashToken(TOKEN), vaultId: VAULT_ID },
    { tokenHash: hashToken(OTHER_TOKEN), vaultId: OTHER_VAULT_ID },
  ]);

  const signing = crypto.signingKeyPairFromSeed(new Uint8Array(crypto.signingSeedBytes).fill(7));
  const agreement = crypto.agreementKeyPairFromSeed(new Uint8Array(crypto.agreementSeedBytes).fill(9));

  return {
    app: createApp(store),
    store,
    crypto,
    signingPublicKey: signing.publicKey,
    signingPrivateKey: signing.privateKey,
    agreementPublicKey: agreement.publicKey,
    contentKey: new Uint8Array(crypto.aeadKeyBytes).fill(3),
    locatorKey: new Uint8Array(32).fill(5),
  };
}

export function authHeaders(token = TOKEN) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function enroll(harness: TestHarness, vaultId = VAULT_ID, token = TOKEN) {
  return harness.app.request(`/api/v1/vaults/${vaultId}/devices`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      deviceId: DEVICE_ID,
      name: "Giraffle test device",
      signingPublicKey: encode(harness.signingPublicKey),
      agreementPublicKey: encode(harness.agreementPublicKey),
      protocolVersion: 1,
    }),
  });
}

export interface BuildRecordOptions {
  sequence: number;
  previousRecordHash?: Uint8Array;
  vaultId?: string;
  deviceId?: string;
  recordId?: string;
}

export function buildRecord(
  harness: TestHarness,
  options: BuildRecordOptions,
): SignedSyncRecordV1 {
  const recordId = options.recordId ?? `record-${options.sequence}`;

  return createSyncRecord(harness.crypto, {
    recordId,
    vaultId: options.vaultId ?? VAULT_ID,
    deviceId: options.deviceId ?? DEVICE_ID,
    deviceSequence: options.sequence,
    previousRecordHash: options.previousRecordHash ?? zeroRecordHash(),
    keyEpoch: 1,
    contentKey: harness.contentKey,
    locatorKey: harness.locatorKey,
    signingPrivateKey: harness.signingPrivateKey,
    nonce: new Uint8Array(harness.crypto.aeadNonceBytes).fill(options.sequence % 251),
    operation: {
      protocolVersion: 1,
      operationId: recordId,
      objectId: `page-${options.sequence}`,
      objectType: "page",
      schemaVersion: 1,
      clock: { physicalMs: 1_700_000_000_000 + options.sequence, logical: 0 },
      mutation: { kind: "upsert", data: { title: `note ${options.sequence}` } },
    },
  });
}

/** Builds a chained run of records, each pointing at the previous record hash. */
export function buildChain(harness: TestHarness, length: number): SignedSyncRecordV1[] {
  const chain: SignedSyncRecordV1[] = [];
  let previousRecordHash: Uint8Array = zeroRecordHash();

  for (let sequence = 1; sequence <= length; sequence += 1) {
    const record = buildRecord(harness, { sequence, previousRecordHash });
    chain.push(record);
    previousRecordHash = hashSignedSyncRecord(harness.crypto, record);
  }

  return chain;
}

export function push(harness: TestHarness, records: SignedSyncRecordV1[], token = TOKEN) {
  return harness.app.request(`/api/v1/vaults/${VAULT_ID}/sync/push`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ records: records.map((record) => encode(encodeSignedSyncRecord(record))) }),
  });
}

export function pull(harness: TestHarness, query = "", token = TOKEN, vaultId = VAULT_ID) {
  return harness.app.request(`/api/v1/vaults/${vaultId}/sync/pull${query}`, {
    headers: authHeaders(token),
  });
}
