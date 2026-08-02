import { beforeAll, describe, expect, it } from "vitest";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
} from "@/domain/e2ee/crypto-provider";
import {
  DEFAULT_ARGON2ID_MEMORY_BYTES,
  PassphraseKeyWrapperError,
  createPassphraseKeyWrapper,
  decodePassphraseKeyWrapper,
  encodePassphraseKeyWrapper,
  openPassphraseKeyWrapper,
} from "@/domain/e2ee/passphrase-key-wrapper";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

describe("passphrase key wrapper", () => {
  let crypto: E2eeCryptoProvider;
  const vaultRootKey = fixedBytes(32, 0x90);
  const passphrase = "correct horse battery staple";

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
  });

  it("round-trips a VRK through canonical serialization", () => {
    const wrapper = createPassphraseKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      passphrase,
    });
    const encoded = encodePassphraseKeyWrapper(wrapper);
    const decoded = decodePassphraseKeyWrapper(encoded);

    expect(encodePassphraseKeyWrapper(decoded)).toEqual(encoded);
    expect(openPassphraseKeyWrapper(crypto, decoded, passphrase)).toEqual(
      vaultRootKey,
    );
  });

  it("normalizes Unicode passphrases with NFKC", () => {
    const wrapper = createPassphraseKeyWrapper(crypto, {
      vaultId: "vault-unicode",
      vaultRootKey,
      passphrase: "Cafe\u0301 recovery phrase",
    });

    expect(
      openPassphraseKeyWrapper(crypto, wrapper, "Café recovery phrase"),
    ).toEqual(vaultRootKey);
  });

  it("rejects a wrong passphrase", () => {
    const wrapper = createPassphraseKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      passphrase,
    });

    expect(() =>
      openPassphraseKeyWrapper(crypto, wrapper, "incorrect passphrase"),
    ).toThrow(CryptoAuthenticationError);
  });

  it("binds KDF and vault metadata into AEAD additional data", () => {
    const wrapper = createPassphraseKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      passphrase,
    });
    const substituted = {
      ...wrapper,
      vaultId: "vault-substituted",
      kdfMemoryBytes: DEFAULT_ARGON2ID_MEMORY_BYTES * 2,
    };

    expect(() =>
      openPassphraseKeyWrapper(crypto, substituted, passphrase),
    ).toThrow(CryptoAuthenticationError);
  });

  it("rejects weak or attacker-amplified KDF parameters before derivation", () => {
    const wrapper = createPassphraseKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      passphrase,
    });

    expect(() =>
      decodePassphraseKeyWrapper(
        encodePassphraseKeyWrapper({
          ...wrapper,
          kdfMemoryBytes: DEFAULT_ARGON2ID_MEMORY_BYTES - 1,
        }),
      ),
    ).toThrow(PassphraseKeyWrapperError);

    expect(() =>
      openPassphraseKeyWrapper(
        crypto,
        { ...wrapper, kdfOpsLimit: Number.MAX_SAFE_INTEGER },
        passphrase,
      ),
    ).toThrow(/outside the allowed range/);
  });

  it("rejects empty passphrases, invalid VRKs, and oversized wrappers", () => {
    expect(() =>
      createPassphraseKeyWrapper(crypto, {
        vaultId: "vault-1",
        vaultRootKey,
        passphrase: "",
      }),
    ).toThrow(/Normalized passphrase/);

    expect(() =>
      createPassphraseKeyWrapper(crypto, {
        vaultId: "vault-1",
        vaultRootKey: new Uint8Array(31),
        passphrase,
      }),
    ).toThrow(/Root Key/);

    expect(() => decodePassphraseKeyWrapper(new Uint8Array(2049))).toThrow(
      /wrapper size is invalid/,
    );
  });
});
