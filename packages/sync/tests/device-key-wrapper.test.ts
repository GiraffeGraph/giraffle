import { beforeAll, describe, expect, it } from "vitest";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type AgreementKeyPair,
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@giraffle/protocol";
import {
  DeviceKeyWrapperError,
  createDeviceKeyWrapper,
  decodeDeviceKeyWrapper,
  encodeDeviceKeyWrapper,
  encodeUnsignedDeviceKeyWrapper,
  openDeviceKeyWrapper,
  type SignedDeviceKeyWrapperV1,
  type UnsignedDeviceKeyWrapperV1,
} from "@giraffle/sync";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

describe("device key wrapper", () => {
  let crypto: E2eeCryptoProvider;
  let authorizer: SigningKeyPair;
  let recipient: AgreementKeyPair;
  let anotherRecipient: AgreementKeyPair;
  const vaultRootKey = fixedBytes(32, 0x70);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    authorizer = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x10));
    recipient = crypto.agreementKeyPairFromSeed(fixedBytes(32, 0x30));
    anotherRecipient = crypto.agreementKeyPairFromSeed(fixedBytes(32, 0x50));
  });

  function createWrapper() {
    return createDeviceKeyWrapper(crypto, {
      wrapperId: "wrapper-1",
      vaultId: "vault-1",
      recipientDeviceId: "device-new",
      recipientAgreementPublicKey: recipient.publicKey,
      authorizingDeviceId: "device-existing",
      authorizingSigningPrivateKey: authorizer.privateKey,
      issuedAt: { physicalMs: 1_700_000_000_000, logical: 3 },
      vaultRootKey,
    });
  }

  it("signs, serializes, opens, and validates a recipient-bound VRK wrapper", () => {
    const wrapper = createWrapper();
    const encoded = encodeDeviceKeyWrapper(wrapper);
    const decoded = decodeDeviceKeyWrapper(encoded);

    expect(encodeDeviceKeyWrapper(decoded)).toEqual(encoded);
    expect(
      openDeviceKeyWrapper(crypto, decoded, {
        authorizingSigningPublicKey: authorizer.publicKey,
        recipientAgreementKeys: recipient,
      }),
    ).toEqual(vaultRootKey);
  });

  it("rejects another recipient before attempting to open the payload", () => {
    expect(() =>
      openDeviceKeyWrapper(crypto, createWrapper(), {
        authorizingSigningPublicKey: authorizer.publicKey,
        recipientAgreementKeys: anotherRecipient,
      }),
    ).toThrow(/targets another public key/);
  });

  it("rejects an unknown authorizer", () => {
    const unknownAuthorizer = crypto.signingKeyPairFromSeed(
      fixedBytes(32, 0x60),
    );

    expect(() =>
      openDeviceKeyWrapper(crypto, createWrapper(), {
        authorizingSigningPublicKey: unknownAuthorizer.publicKey,
        recipientAgreementKeys: recipient,
      }),
    ).toThrow(/signature is invalid/);
  });

  it("rejects sealed-payload corruption even if an attacker can re-sign", () => {
    const wrapper = structuredClone(createWrapper());
    wrapper.sealedPayload[wrapper.sealedPayload.length - 1] ^= 1;
    const { signature: _oldSignature, ...unsigned } = wrapper;
    wrapper.signature = crypto.sign(
      encodeUnsignedDeviceKeyWrapper(unsigned as UnsignedDeviceKeyWrapperV1),
      authorizer.privateKey,
    );

    expect(() =>
      openDeviceKeyWrapper(crypto, wrapper, {
        authorizingSigningPublicKey: authorizer.publicKey,
        recipientAgreementKeys: recipient,
      }),
    ).toThrow(CryptoAuthenticationError);
  });

  it("rejects an outer-context substitution after authenticated opening", () => {
    const wrapper: SignedDeviceKeyWrapperV1 = {
      ...structuredClone(createWrapper()),
      recipientDeviceId: "device-substituted",
    };
    const { signature: _oldSignature, ...unsigned } = wrapper;
    wrapper.signature = crypto.sign(
      encodeUnsignedDeviceKeyWrapper(unsigned),
      authorizer.privateKey,
    );

    expect(() =>
      openDeviceKeyWrapper(crypto, wrapper, {
        authorizingSigningPublicKey: authorizer.publicKey,
        recipientAgreementKeys: recipient,
      }),
    ).toThrow(/context does not match/);
  });

  it("enforces VRK and encoded-wrapper size limits", () => {
    expect(() =>
      createDeviceKeyWrapper(crypto, {
        wrapperId: "wrapper-invalid",
        vaultId: "vault-1",
        recipientDeviceId: "device-new",
        recipientAgreementPublicKey: recipient.publicKey,
        authorizingDeviceId: "device-existing",
        authorizingSigningPrivateKey: authorizer.privateKey,
        issuedAt: { physicalMs: 1, logical: 0 },
        vaultRootKey: new Uint8Array(31),
      }),
    ).toThrow(DeviceKeyWrapperError);

    expect(() => decodeDeviceKeyWrapper(new Uint8Array(5000))).toThrow(
      /wrapper size is invalid/,
    );
  });
});
