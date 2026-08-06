import { beforeAll, describe, expect, it } from "vitest";
import vectors from "../../../tests/vectors/e2ee-v1.json";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";
import {
  RecoveryKeyWrapperError,
  createRecoveryKeyWrapper,
  createRecoveryMaterial,
  decodeRecoveryKeyWrapper,
  encodeRecoveryKeyWrapper,
  formatRecoveryCode,
  openRecoveryKeyWrapper,
  parseRecoveryCode,
} from "@giraffle/sync";

function fromHex(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

describe("recovery key wrapper", () => {
  let crypto: E2eeCryptoProvider;
  const vaultRootKey = fixedBytes(32, 0xa0);
  const recoverySecret = fromHex(vectors.recoveryCode.secret);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
  });

  it("formats and parses a versioned checksummed recovery code", () => {
    const code = formatRecoveryCode(crypto, recoverySecret);

    expect(code).toBe(vectors.recoveryCode.formatted);
    expect(code).toMatch(/^GIR1-(?:[0-9A-HJKMNP-TV-Z]{4}-)+[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(parseRecoveryCode(crypto, code.toLowerCase())).toEqual(
      recoverySecret,
    );
  });

  it("rejects recovery code transcription errors before key derivation", () => {
    const code = formatRecoveryCode(crypto, recoverySecret);
    const finalCharacter = code.at(-1);
    const corrupted = `${code.slice(0, -1)}${finalCharacter === "0" ? "1" : "0"}`;

    expect(() => parseRecoveryCode(crypto, corrupted)).toThrow(
      /checksum is invalid/,
    );
    expect(() => parseRecoveryCode(crypto, `GIR2-${code.slice(5)}`)).toThrow(
      /Unsupported recovery code version/,
    );
  });

  it("round-trips a VRK through canonical serialization", () => {
    const wrapper = createRecoveryKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      recoverySecret,
    });
    const encoded = encodeRecoveryKeyWrapper(wrapper);
    const decoded = decodeRecoveryKeyWrapper(encoded);
    const recoveryCode = formatRecoveryCode(crypto, recoverySecret);

    expect(encodeRecoveryKeyWrapper(decoded)).toEqual(encoded);
    expect(openRecoveryKeyWrapper(crypto, decoded, recoveryCode)).toEqual(
      vaultRootKey,
    );
  });

  it("creates a new printable recovery material bundle", () => {
    const material = createRecoveryMaterial(crypto, {
      vaultId: "vault-generated",
      vaultRootKey,
    });

    expect(
      openRecoveryKeyWrapper(
        crypto,
        material.wrapper,
        material.recoveryCode,
      ),
    ).toEqual(vaultRootKey);
  });

  it("rejects another valid recovery secret", () => {
    const wrapper = createRecoveryKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      recoverySecret,
    });
    const otherCode = formatRecoveryCode(crypto, fixedBytes(32, 0x40));

    expect(() => openRecoveryKeyWrapper(crypto, wrapper, otherCode)).toThrow(
      CryptoAuthenticationError,
    );
  });

  it("binds vault metadata into AEAD additional data", () => {
    const wrapper = createRecoveryKeyWrapper(crypto, {
      vaultId: "vault-1",
      vaultRootKey,
      recoverySecret,
    });
    const substituted = { ...wrapper, vaultId: "vault-substituted" };

    expect(() =>
      openRecoveryKeyWrapper(
        crypto,
        substituted,
        formatRecoveryCode(crypto, recoverySecret),
      ),
    ).toThrow(CryptoAuthenticationError);
  });

  it("rejects invalid secrets, VRKs, and encoded wrapper sizes", () => {
    expect(() => formatRecoveryCode(crypto, new Uint8Array(31))).toThrow(
      RecoveryKeyWrapperError,
    );
    expect(() =>
      createRecoveryKeyWrapper(crypto, {
        vaultId: "vault-1",
        vaultRootKey: new Uint8Array(31),
        recoverySecret,
      }),
    ).toThrow(/Root Key/);
    expect(() => decodeRecoveryKeyWrapper(new Uint8Array(1025))).toThrow(
      /wrapper size is invalid/,
    );
  });
});
