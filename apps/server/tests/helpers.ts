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
import {
  encodeDeviceAuthorizationStatement,
  zeroGrantHash,
} from "../src/device-statement.ts";
import { DEVICE_HEADER, hashToken } from "../src/routes/auth.ts";
import { resetAllRateLimits } from "../src/rate-limit.ts";
import { openDatabase } from "../src/storage/database.ts";
import { createStore, type Store } from "../src/storage/queries.ts";

export const VAULT_ID = "vault-primary";
export const OTHER_VAULT_ID = "vault-secondary";
export const DEVICE_ID = "device-alpha";
export const SECOND_DEVICE_ID = "device-beta";
export const TOKEN = "test-token-000000000000000000000000000000";
export const OTHER_TOKEN = "other-token-1111111111111111111111111111";

export interface TestDeviceKeys {
  deviceId: string;
  signingPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  agreementPrivateKey: Uint8Array;
}

export interface TestHarness {
  app: ReturnType<typeof createApp>;
  store: Store;
  crypto: E2eeCryptoProvider;
  signingPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  contentKey: Uint8Array;
  locatorKey: Uint8Array;
  vaultRootKey: Uint8Array;
  second: TestDeviceKeys;
}

export function encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function deviceKeys(
  crypto: E2eeCryptoProvider,
  deviceId: string,
  seed: number,
): TestDeviceKeys {
  const signing = crypto.signingKeyPairFromSeed(new Uint8Array(crypto.signingSeedBytes).fill(seed));
  const agreement = crypto.agreementKeyPairFromSeed(
    new Uint8Array(crypto.agreementSeedBytes).fill(seed + 1),
  );
  return {
    deviceId,
    signingPublicKey: signing.publicKey,
    signingPrivateKey: signing.privateKey,
    agreementPublicKey: agreement.publicKey,
    agreementPrivateKey: agreement.privateKey,
  };
}

export async function createHarness(): Promise<TestHarness> {
  resetAllRateLimits();

  const crypto = await createSodiumCryptoProvider();
  const store = createStore(openDatabase(":memory:"));
  store.replaceAccessTokens([
    { tokenHash: hashToken(TOKEN), vaultId: VAULT_ID },
    { tokenHash: hashToken(OTHER_TOKEN), vaultId: OTHER_VAULT_ID },
  ]);

  const first = deviceKeys(crypto, DEVICE_ID, 7);

  return {
    app: createApp(store),
    store,
    crypto,
    signingPublicKey: first.signingPublicKey,
    signingPrivateKey: first.signingPrivateKey,
    agreementPublicKey: first.agreementPublicKey,
    contentKey: new Uint8Array(crypto.aeadKeyBytes).fill(3),
    locatorKey: new Uint8Array(32).fill(5),
    vaultRootKey: new Uint8Array(32).fill(42),
    second: deviceKeys(crypto, SECOND_DEVICE_ID, 21),
  };
}

export function authHeaders(token = TOKEN, deviceId: string | null = DEVICE_ID) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(deviceId ? { [DEVICE_HEADER]: deviceId } : {}),
  };
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

export function enrollSecondDevice(harness: TestHarness, vaultId = VAULT_ID, token = TOKEN) {
  return harness.app.request(`/api/v1/vaults/${vaultId}/devices`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      deviceId: harness.second.deviceId,
      name: "Giraffle second device",
      signingPublicKey: encode(harness.second.signingPublicKey),
      agreementPublicKey: encode(harness.second.agreementPublicKey),
      protocolVersion: 1,
    }),
  });
}

/**
 * Stands in for the client-side access grant: a sealed box only the recipient
 * device can open. The relay never gets a chance to look inside, which is
 * exactly what the opacity test asserts.
 */
export function sealGrant(harness: TestHarness, recipient: TestDeviceKeys): Uint8Array {
  return harness.crypto.seal(harness.vaultRootKey, recipient.agreementPublicKey);
}

export interface AuthorizationOptions {
  action: "approve" | "revoke";
  acting?: TestDeviceKeys;
  subject?: TestDeviceKeys;
  grant?: Uint8Array;
  issuedAtMs?: number;
  vaultId?: string;
  subjectSigningPublicKey?: Uint8Array;
  subjectAgreementPublicKey?: Uint8Array;
}

export function signAuthorization(harness: TestHarness, options: AuthorizationOptions) {
  const acting =
    options.acting ??
    ({
      deviceId: DEVICE_ID,
      signingPublicKey: harness.signingPublicKey,
      signingPrivateKey: harness.signingPrivateKey,
      agreementPublicKey: harness.agreementPublicKey,
      agreementPrivateKey: new Uint8Array(32),
    } satisfies TestDeviceKeys);
  const subject = options.subject ?? harness.second;

  const statement = encodeDeviceAuthorizationStatement({
    protocolVersion: 1,
    statementVersion: 1,
    action: options.action,
    vaultId: options.vaultId ?? VAULT_ID,
    actingDeviceId: acting.deviceId,
    subjectDeviceId: subject.deviceId,
    subjectSigningPublicKey: options.subjectSigningPublicKey ?? subject.signingPublicKey,
    subjectAgreementPublicKey: options.subjectAgreementPublicKey ?? subject.agreementPublicKey,
    issuedAtMs: options.issuedAtMs ?? Date.now(),
    grantHash: options.grant
      ? harness.crypto.hash(options.grant, 32)
      : zeroGrantHash(),
  });

  return {
    statement,
    signature: harness.crypto.sign(statement, acting.signingPrivateKey),
    subjectDeviceId: subject.deviceId,
  };
}

export function postAuthorization(
  harness: TestHarness,
  options: AuthorizationOptions,
  token = TOKEN,
) {
  const signed = signAuthorization(harness, options);
  return harness.app.request(
    `/api/v1/vaults/${options.vaultId ?? VAULT_ID}/devices/${signed.subjectDeviceId}/authorization`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        statement: encode(signed.statement),
        signature: encode(signed.signature),
        ...(options.grant ? { grant: encode(options.grant) } : {}),
      }),
    },
  );
}

/** Runs the whole join flow so record-level tests can start from two devices. */
export async function approveSecondDevice(harness: TestHarness) {
  const enrolled = await enrollSecondDevice(harness);
  const grant = sealGrant(harness, harness.second);
  const approved = await postAuthorization(harness, { action: "approve", grant });
  return { enrolled, approved, grant };
}

export interface BuildRecordOptions {
  sequence: number;
  previousRecordHash?: Uint8Array;
  vaultId?: string;
  deviceId?: string;
  recordId?: string;
  signingPrivateKey?: Uint8Array;
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
    signingPrivateKey: options.signingPrivateKey ?? harness.signingPrivateKey,
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

export function push(
  harness: TestHarness,
  records: SignedSyncRecordV1[],
  token = TOKEN,
  deviceId: string | null = DEVICE_ID,
) {
  return harness.app.request(`/api/v1/vaults/${VAULT_ID}/sync/push`, {
    method: "POST",
    headers: authHeaders(token, deviceId),
    body: JSON.stringify({ records: records.map((record) => encode(encodeSignedSyncRecord(record))) }),
  });
}

export function pull(
  harness: TestHarness,
  query = "",
  token = TOKEN,
  vaultId = VAULT_ID,
  deviceId: string | null = DEVICE_ID,
) {
  return harness.app.request(`/api/v1/vaults/${vaultId}/sync/pull${query}`, {
    headers: authHeaders(token, deviceId),
  });
}
