import {
  decodeCanonical,
  encodeCanonical,
  E2EE_CRYPTO_SUITE,
  E2EE_PROTOCOL_VERSION,
  type AgreementKeyPair,
  type E2eeCryptoProvider,
  type HybridLogicalClock,
} from "@giraffle/protocol";
import {
  createDeviceKeyWrapper,
  decodeDeviceKeyWrapper,
  encodeDeviceKeyWrapper,
  openDeviceKeyWrapper,
  VAULT_ROOT_KEY_BYTES,
} from "@giraffle/sync";

export const ACCESS_GRANT_VERSION = 1 as const;
export const MAX_ENCODED_ACCESS_GRANT_BYTES = 8192;

export interface VaultSecrets {
  vaultRootKey: Uint8Array;
  contentKey: Uint8Array;
  locatorKey: Uint8Array;
}

export interface OpenedAccessGrant extends VaultSecrets {
  authorizingDeviceId: string;
}

export class AccessGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessGrantError";
  }
}

function secretsAad(input: {
  vaultId: string;
  recipientDeviceId: string;
  nonce: Uint8Array;
}) {
  return encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    grantVersion: ACCESS_GRANT_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: input.vaultId,
    recipientDeviceId: input.recipientDeviceId,
    nonce: input.nonce,
  });
}

function assertKey(value: unknown, label: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== VAULT_ROOT_KEY_BYTES) {
    throw new AccessGrantError(`${label} must be exactly ${VAULT_ROOT_KEY_BYTES} bytes`);
  }
}

/**
 * The Vault Root Key travels in the shared device key wrapper, sealed to the new
 * device's X25519 key and signed by the approving device. The content and
 * locator keys are vault-wide secrets that no existing wrapper carries, so they
 * ride alongside encrypted under that same root key. The relay therefore holds
 * one blob it has no key for, and the approving device signs the whole thing.
 */
export function createAccessGrant(
  crypto: E2eeCryptoProvider,
  input: {
    wrapperId: string;
    vaultId: string;
    recipientDeviceId: string;
    recipientAgreementPublicKey: Uint8Array;
    authorizingDeviceId: string;
    authorizingSigningPrivateKey: Uint8Array;
    issuedAt: HybridLogicalClock;
    secrets: VaultSecrets;
  },
): Uint8Array {
  assertKey(input.secrets.vaultRootKey, "Vault Root Key");
  assertKey(input.secrets.contentKey, "Content key");
  assertKey(input.secrets.locatorKey, "Locator key");

  const wrapper = createDeviceKeyWrapper(crypto, {
    wrapperId: input.wrapperId,
    vaultId: input.vaultId,
    recipientDeviceId: input.recipientDeviceId,
    recipientAgreementPublicKey: input.recipientAgreementPublicKey,
    authorizingDeviceId: input.authorizingDeviceId,
    authorizingSigningPrivateKey: input.authorizingSigningPrivateKey,
    issuedAt: input.issuedAt,
    vaultRootKey: input.secrets.vaultRootKey,
  });

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const plaintext = encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    grantVersion: ACCESS_GRANT_VERSION,
    vaultId: input.vaultId,
    recipientDeviceId: input.recipientDeviceId,
    contentKey: input.secrets.contentKey,
    locatorKey: input.secrets.locatorKey,
  });

  let ciphertext: Uint8Array;
  try {
    ciphertext = crypto.encrypt({
      plaintext,
      additionalData: secretsAad({
        vaultId: input.vaultId,
        recipientDeviceId: input.recipientDeviceId,
        nonce,
      }),
      key: input.secrets.vaultRootKey,
      nonce,
    }).ciphertext;
  } finally {
    crypto.clear(plaintext);
  }

  return encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    grantVersion: ACCESS_GRANT_VERSION,
    deviceWrapper: encodeDeviceKeyWrapper(wrapper),
    secretsNonce: nonce,
    secretsCiphertext: ciphertext,
  });
}

export function openAccessGrant(
  crypto: E2eeCryptoProvider,
  encodedGrant: Uint8Array,
  input: {
    vaultId: string;
    recipientDeviceId: string;
    authorizingSigningPublicKey: Uint8Array;
    recipientAgreementKeys: AgreementKeyPair;
  },
): OpenedAccessGrant {
  if (encodedGrant.length === 0 || encodedGrant.length > MAX_ENCODED_ACCESS_GRANT_BYTES) {
    throw new AccessGrantError("Encoded access grant size is invalid");
  }

  const decoded = decodeCanonical(encodedGrant);
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new AccessGrantError("Access grant must be an object");
  }

  const value = decoded as Record<string, unknown>;
  if (
    value.protocolVersion !== E2EE_PROTOCOL_VERSION ||
    value.grantVersion !== ACCESS_GRANT_VERSION ||
    !(value.deviceWrapper instanceof Uint8Array) ||
    !(value.secretsNonce instanceof Uint8Array) ||
    !(value.secretsCiphertext instanceof Uint8Array)
  ) {
    throw new AccessGrantError("Access grant is malformed");
  }

  const wrapper = decodeDeviceKeyWrapper(value.deviceWrapper);
  if (
    wrapper.vaultId !== input.vaultId ||
    wrapper.recipientDeviceId !== input.recipientDeviceId
  ) {
    throw new AccessGrantError("Access grant was issued for a different device");
  }

  const vaultRootKey = openDeviceKeyWrapper(crypto, wrapper, {
    authorizingSigningPublicKey: input.authorizingSigningPublicKey,
    recipientAgreementKeys: input.recipientAgreementKeys,
  });

  const plaintext = crypto.decrypt({
    ciphertext: value.secretsCiphertext,
    additionalData: secretsAad({
      vaultId: input.vaultId,
      recipientDeviceId: input.recipientDeviceId,
      nonce: value.secretsNonce,
    }),
    key: vaultRootKey,
    nonce: value.secretsNonce,
  });

  try {
    const payload = decodeCanonical(plaintext);
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new AccessGrantError("Wrapped vault secrets are malformed");
    }
    const secrets = payload as Record<string, unknown>;
    if (
      secrets.protocolVersion !== E2EE_PROTOCOL_VERSION ||
      secrets.grantVersion !== ACCESS_GRANT_VERSION ||
      secrets.vaultId !== input.vaultId ||
      secrets.recipientDeviceId !== input.recipientDeviceId
    ) {
      throw new AccessGrantError("Wrapped vault secrets do not match this grant");
    }
    assertKey(secrets.contentKey, "Content key");
    assertKey(secrets.locatorKey, "Locator key");

    return {
      vaultRootKey,
      contentKey: secrets.contentKey.slice(),
      locatorKey: secrets.locatorKey.slice(),
      authorizingDeviceId: wrapper.authorizingDeviceId,
    };
  } finally {
    crypto.clear(plaintext);
  }
}
