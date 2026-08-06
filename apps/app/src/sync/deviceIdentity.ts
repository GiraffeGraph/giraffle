import { encodeCanonical, type E2eeCryptoProvider } from "@giraffle/protocol";

export const DEVICE_STATEMENT_VERSION = 1 as const;
export const FINGERPRINT_GROUPS = 4;
const FINGERPRINT_GROUP_DIGITS = 5;
const FINGERPRINT_LABEL = "giraffle-device-fingerprint-v1";

export type DeviceAuthorizationAction = "approve" | "revoke";

export interface DevicePublicIdentity {
  deviceId: string;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
}

/**
 * A short number the human reads aloud. It covers the device id and both public
 * keys, so a relay that swapped either key would produce a different number on
 * the two screens and the comparison would fail. This is the only thing standing
 * between the join flow and a server-side key substitution.
 */
export function deviceFingerprint(
  crypto: E2eeCryptoProvider,
  identity: DevicePublicIdentity,
): string {
  const digest = crypto.hash(
    encodeCanonical([
      FINGERPRINT_LABEL,
      identity.deviceId,
      identity.signingPublicKey,
      identity.agreementPublicKey,
    ]),
    FINGERPRINT_GROUPS * 4,
  );

  const groups: string[] = [];
  for (let group = 0; group < FINGERPRINT_GROUPS; group += 1) {
    let value = 0;
    for (let byte = 0; byte < 4; byte += 1) {
      value = value * 256 + (digest[group * 4 + byte] ?? 0);
    }
    groups.push(String(value % 10 ** FINGERPRINT_GROUP_DIGITS).padStart(FINGERPRINT_GROUP_DIGITS, "0"));
  }
  return groups.join("-");
}

export function zeroGrantHash(): Uint8Array {
  return new Uint8Array(32);
}

/**
 * Mirrors the statement the relay verifies in `apps/server/src/device-statement.ts`.
 * The two definitions stay apart on purpose: the relay must never be able to
 * reach the client packages that hold vault key material.
 */
export function encodeAuthorizationStatement(input: {
  action: DeviceAuthorizationAction;
  vaultId: string;
  actingDeviceId: string;
  subject: DevicePublicIdentity;
  issuedAtMs: number;
  grantHash: Uint8Array;
}): Uint8Array {
  return encodeCanonical({
    protocolVersion: 1,
    statementVersion: DEVICE_STATEMENT_VERSION,
    action: input.action,
    vaultId: input.vaultId,
    actingDeviceId: input.actingDeviceId,
    subjectDeviceId: input.subject.deviceId,
    subjectSigningPublicKey: input.subject.signingPublicKey,
    subjectAgreementPublicKey: input.subject.agreementPublicKey,
    issuedAtMs: input.issuedAtMs,
    grantHash: input.grantHash,
  });
}

export interface SignedAuthorization {
  statement: Uint8Array;
  signature: Uint8Array;
}

export function signAuthorizationStatement(
  crypto: E2eeCryptoProvider,
  input: {
    action: DeviceAuthorizationAction;
    vaultId: string;
    actingDeviceId: string;
    actingSigningPrivateKey: Uint8Array;
    subject: DevicePublicIdentity;
    grant?: Uint8Array;
    issuedAtMs?: number;
  },
): SignedAuthorization {
  const statement = encodeAuthorizationStatement({
    action: input.action,
    vaultId: input.vaultId,
    actingDeviceId: input.actingDeviceId,
    subject: input.subject,
    issuedAtMs: input.issuedAtMs ?? Date.now(),
    grantHash: input.grant ? crypto.hash(input.grant, 32) : zeroGrantHash(),
  });

  return { statement, signature: crypto.sign(statement, input.actingSigningPrivateKey) };
}
