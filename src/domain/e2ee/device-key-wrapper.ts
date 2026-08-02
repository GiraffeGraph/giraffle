import {
  decodeCanonical,
  encodeCanonical,
} from "./canonical-cbor";
import type { E2eeCryptoProvider, AgreementKeyPair } from "./crypto-provider";
import { CryptoAuthenticationError } from "./crypto-provider";
import {
  assertHybridLogicalClock,
  type HybridLogicalClock,
} from "./hybrid-logical-clock";
import { bytesEqual, E2EE_PROTOCOL_VERSION } from "./sync-record";

export const DEVICE_WRAPPER_VERSION = 1 as const;
export const DEVICE_WRAPPER_SUITE = "libsodium-sealed-box-ed25519-v1" as const;
export const VAULT_ROOT_KEY_BYTES = 32;
export const MAX_ENCODED_DEVICE_WRAPPER_BYTES = 4096;

export interface UnsignedDeviceKeyWrapperV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  wrapperVersion: typeof DEVICE_WRAPPER_VERSION;
  suiteId: typeof DEVICE_WRAPPER_SUITE;
  wrapperId: string;
  vaultId: string;
  recipientDeviceId: string;
  recipientAgreementPublicKey: Uint8Array;
  authorizingDeviceId: string;
  issuedAt: HybridLogicalClock;
  sealedPayload: Uint8Array;
}

export interface SignedDeviceKeyWrapperV1
  extends UnsignedDeviceKeyWrapperV1 {
  signature: Uint8Array;
}

export class DeviceKeyWrapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceKeyWrapperError";
  }
}

function assertIdentifier(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new DeviceKeyWrapperError(`${label} is invalid`);
  }
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    throw new DeviceKeyWrapperError(`${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const expectedSet = new Set(expected);
  const keys = Object.keys(value);
  if (
    keys.length !== expectedSet.size ||
    keys.some((key) => !expectedSet.has(key))
  ) {
    throw new DeviceKeyWrapperError(`${label} contains unexpected fields`);
  }
}

function unsignedWrapper(
  wrapper: SignedDeviceKeyWrapperV1,
): UnsignedDeviceKeyWrapperV1 {
  return {
    protocolVersion: wrapper.protocolVersion,
    wrapperVersion: wrapper.wrapperVersion,
    suiteId: wrapper.suiteId,
    wrapperId: wrapper.wrapperId,
    vaultId: wrapper.vaultId,
    recipientDeviceId: wrapper.recipientDeviceId,
    recipientAgreementPublicKey: wrapper.recipientAgreementPublicKey,
    authorizingDeviceId: wrapper.authorizingDeviceId,
    issuedAt: wrapper.issuedAt,
    sealedPayload: wrapper.sealedPayload,
  };
}

export function assertDeviceKeyWrapper(
  value: unknown,
): asserts value is SignedDeviceKeyWrapperV1 {
  assertObject(value, "wrapper");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "wrapperVersion",
      "suiteId",
      "wrapperId",
      "vaultId",
      "recipientDeviceId",
      "recipientAgreementPublicKey",
      "authorizingDeviceId",
      "issuedAt",
      "sealedPayload",
      "signature",
    ],
    "wrapper",
  );

  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new DeviceKeyWrapperError("Unsupported protocol version");
  }
  if (value.wrapperVersion !== DEVICE_WRAPPER_VERSION) {
    throw new DeviceKeyWrapperError("Unsupported device wrapper version");
  }
  if (value.suiteId !== DEVICE_WRAPPER_SUITE) {
    throw new DeviceKeyWrapperError("Unsupported device wrapper suite");
  }

  assertIdentifier(value.wrapperId, "wrapperId");
  assertIdentifier(value.vaultId, "vaultId");
  assertIdentifier(value.recipientDeviceId, "recipientDeviceId");
  assertIdentifier(value.authorizingDeviceId, "authorizingDeviceId");

  if (
    !(value.recipientAgreementPublicKey instanceof Uint8Array) ||
    value.recipientAgreementPublicKey.length !== 32
  ) {
    throw new DeviceKeyWrapperError(
      "recipientAgreementPublicKey must be exactly 32 bytes",
    );
  }
  if (
    !(value.sealedPayload instanceof Uint8Array) ||
    value.sealedPayload.length < VAULT_ROOT_KEY_BYTES ||
    value.sealedPayload.length > 2048
  ) {
    throw new DeviceKeyWrapperError("sealedPayload size is invalid");
  }
  if (!(value.signature instanceof Uint8Array) || value.signature.length !== 64) {
    throw new DeviceKeyWrapperError("signature must be exactly 64 bytes");
  }

  assertObject(value.issuedAt, "issuedAt");
  assertExactKeys(value.issuedAt, ["physicalMs", "logical"], "issuedAt");
  try {
    assertHybridLogicalClock(
      value.issuedAt as unknown as HybridLogicalClock,
      "issuedAt",
    );
  } catch (error) {
    throw new DeviceKeyWrapperError(
      error instanceof Error ? error.message : "issuedAt is invalid",
    );
  }
}

export function encodeUnsignedDeviceKeyWrapper(
  wrapper: UnsignedDeviceKeyWrapperV1,
) {
  return encodeCanonical(wrapper);
}

export function encodeDeviceKeyWrapper(wrapper: SignedDeviceKeyWrapperV1) {
  assertDeviceKeyWrapper(wrapper);
  return encodeCanonical(wrapper);
}

export function decodeDeviceKeyWrapper(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_DEVICE_WRAPPER_BYTES) {
    throw new DeviceKeyWrapperError("Encoded device wrapper size is invalid");
  }
  const value = decodeCanonical(bytes);
  assertDeviceKeyWrapper(value);
  return value;
}

export function createDeviceKeyWrapper(
  crypto: E2eeCryptoProvider,
  input: {
    wrapperId: string;
    vaultId: string;
    recipientDeviceId: string;
    recipientAgreementPublicKey: Uint8Array;
    authorizingDeviceId: string;
    authorizingSigningPrivateKey: Uint8Array;
    issuedAt: HybridLogicalClock;
    vaultRootKey: Uint8Array;
  },
): SignedDeviceKeyWrapperV1 {
  assertIdentifier(input.wrapperId, "wrapperId");
  assertIdentifier(input.vaultId, "vaultId");
  assertIdentifier(input.recipientDeviceId, "recipientDeviceId");
  assertIdentifier(input.authorizingDeviceId, "authorizingDeviceId");
  assertHybridLogicalClock(input.issuedAt, "issuedAt");

  if (input.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES) {
    throw new DeviceKeyWrapperError("Vault Root Key must be exactly 32 bytes");
  }
  if (
    input.recipientAgreementPublicKey.length !== crypto.agreementPublicKeyBytes
  ) {
    throw new DeviceKeyWrapperError(
      `Recipient agreement public key must be exactly ${crypto.agreementPublicKeyBytes} bytes`,
    );
  }

  const plaintext = encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: DEVICE_WRAPPER_VERSION,
    vaultId: input.vaultId,
    recipientDeviceId: input.recipientDeviceId,
    vaultRootKey: input.vaultRootKey,
  });
  let sealedPayload: Uint8Array;
  try {
    sealedPayload = crypto.seal(
      plaintext,
      input.recipientAgreementPublicKey,
    );
  } finally {
    crypto.clear(plaintext);
  }

  const unsigned: UnsignedDeviceKeyWrapperV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: DEVICE_WRAPPER_VERSION,
    suiteId: DEVICE_WRAPPER_SUITE,
    wrapperId: input.wrapperId,
    vaultId: input.vaultId,
    recipientDeviceId: input.recipientDeviceId,
    recipientAgreementPublicKey: input.recipientAgreementPublicKey.slice(),
    authorizingDeviceId: input.authorizingDeviceId,
    issuedAt: { ...input.issuedAt },
    sealedPayload,
  };

  return {
    ...unsigned,
    signature: crypto.sign(
      encodeUnsignedDeviceKeyWrapper(unsigned),
      input.authorizingSigningPrivateKey,
    ),
  };
}

export function openDeviceKeyWrapper(
  crypto: E2eeCryptoProvider,
  wrapper: SignedDeviceKeyWrapperV1,
  input: {
    authorizingSigningPublicKey: Uint8Array;
    recipientAgreementKeys: AgreementKeyPair;
  },
) {
  assertDeviceKeyWrapper(wrapper);

  if (
    !crypto.verify(
      encodeUnsignedDeviceKeyWrapper(unsignedWrapper(wrapper)),
      wrapper.signature,
      input.authorizingSigningPublicKey,
    )
  ) {
    throw new DeviceKeyWrapperError("Device wrapper signature is invalid");
  }
  if (
    !bytesEqual(
      wrapper.recipientAgreementPublicKey,
      input.recipientAgreementKeys.publicKey,
    )
  ) {
    throw new DeviceKeyWrapperError("Device wrapper targets another public key");
  }

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.openSealed(
      wrapper.sealedPayload,
      input.recipientAgreementKeys.publicKey,
      input.recipientAgreementKeys.privateKey,
    );
  } catch (error) {
    if (error instanceof CryptoAuthenticationError) {
      throw error;
    }
    throw new CryptoAuthenticationError();
  }

  try {
    const payload = decodeCanonical(plaintext);
    assertObject(payload, "wrapped payload");
    assertExactKeys(
      payload,
      [
        "protocolVersion",
        "wrapperVersion",
        "vaultId",
        "recipientDeviceId",
        "vaultRootKey",
      ],
      "wrapped payload",
    );

    if (
      payload.protocolVersion !== E2EE_PROTOCOL_VERSION ||
      payload.wrapperVersion !== DEVICE_WRAPPER_VERSION ||
      payload.vaultId !== wrapper.vaultId ||
      payload.recipientDeviceId !== wrapper.recipientDeviceId
    ) {
      throw new DeviceKeyWrapperError(
        "Wrapped payload context does not match device wrapper",
      );
    }
    if (
      !(payload.vaultRootKey instanceof Uint8Array) ||
      payload.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES
    ) {
      throw new DeviceKeyWrapperError("Wrapped Vault Root Key is invalid");
    }

    return payload.vaultRootKey.slice();
  } finally {
    crypto.clear(plaintext);
  }
}
