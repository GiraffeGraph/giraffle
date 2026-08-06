import {
  createPassphraseKeyWrapper,
  openPassphraseKeyWrapper,
} from "@giraffle/sync";
import type { E2eeCryptoProvider } from "@giraffle/protocol";
import * as nativeDatabase from "@/infrastructure/database/openDatabase";
import * as webDatabase from "@/infrastructure/database/openDatabase.web";
import * as nativeKeys from "@/infrastructure/secure-storage/vaultKeys";
import * as webKeys from "@/infrastructure/secure-storage/vaultKeys.web";
import type { VaultKeyStore } from "@/infrastructure/secure-storage/vaultKeys.contract";
import * as nativeSyncConfig from "@/infrastructure/sync/syncConfiguration";
import * as webSyncConfig from "@/infrastructure/sync/syncConfiguration.web";
import type { SyncConfigurationStore } from "@/infrastructure/sync/syncConfiguration.contract";
import * as nativeCrypto from "@/sync/cryptoProvider";
import * as webCrypto from "@/sync/cryptoProvider.web";
import vector from "../../../tests/vectors/e2ee-v1.json";

// The WebAssembly engine cannot load under Jest and this suite only inspects
// the shape of the module that uses it. Babel hoists this above the imports.
jest.mock("@/infrastructure/database/sqliteWasm", () =>
  jest.requireActual("./support/webSqlite"),
);

const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
const hex = (value: Uint8Array) =>
  [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const VAULT_KEY_STORE_MEMBERS = [
  "hasLocalVault",
  "hasVaultWrapper",
  "hasQuickPin",
  "createLocalKeys",
  "saveVaultKeys",
  "createPassphraseWrapper",
  "createQuickPin",
  "unlockLocalKeys",
  "clearQuickPin",
  "clearVaultWrapper",
  "clearLocalKeys",
  "clearKeyMaterial",
  "isValidPin",
] as const satisfies readonly (keyof VaultKeyStore)[];

const SYNC_CONFIGURATION_MEMBERS = [
  "saveSyncConfiguration",
  "loadSyncConfiguration",
  "clearSyncConfiguration",
] as const satisfies readonly (keyof SyncConfigurationStore)[];

const DATABASE_MEMBERS = ["openEncryptedDatabase", "deleteEncryptedDatabase"] as const;

function memberTypes(module: Record<string, unknown>, members: readonly string[]) {
  return Object.fromEntries(members.map((name) => [name, typeof module[name]]));
}

/**
 * Metro picks one of each pair by filename, so nothing above these modules can
 * see which platform it is on. That only holds while both halves really expose
 * the same shape — the point of these assertions.
 */
describe("platform module contracts", () => {
  test("the vault key store is the same shape on a device and in a browser", () => {
    const expected = Object.fromEntries(
      VAULT_KEY_STORE_MEMBERS.map((name) => [name, "function"]),
    );

    expect(memberTypes(nativeKeys, VAULT_KEY_STORE_MEMBERS)).toEqual(expected);
    expect(memberTypes(webKeys, VAULT_KEY_STORE_MEMBERS)).toEqual(expected);
  });

  test("the encrypted database is opened and deleted the same way on both", () => {
    const expected = Object.fromEntries(
      DATABASE_MEMBERS.map((name) => [name, "function"]),
    );

    expect(memberTypes(nativeDatabase, DATABASE_MEMBERS)).toEqual(expected);
    expect(memberTypes(webDatabase, DATABASE_MEMBERS)).toEqual(expected);
  });

  test("the sync configuration store is the same shape on both", () => {
    const expected = Object.fromEntries(
      SYNC_CONFIGURATION_MEMBERS.map((name) => [name, "function"]),
    );

    expect(memberTypes(nativeSyncConfig, SYNC_CONFIGURATION_MEMBERS)).toEqual(expected);
    expect(memberTypes(webSyncConfig, SYNC_CONFIGURATION_MEMBERS)).toEqual(expected);
  });

  test("the quick PIN rule cannot drift between platforms", () => {
    for (const candidate of ["0000", "9999", "12", "abcd", "12345", ""]) {
      expect(webKeys.isValidPin(candidate)).toBe(nativeKeys.isValidPin(candidate));
    }
  });
});

describe("crypto providers agree across builds", () => {
  const providers: [string, E2eeCryptoProvider][] = [
    ["native", nativeCrypto.vaultCryptoProvider],
    ["web", webCrypto.vaultCryptoProvider],
  ];

  beforeAll(async () => {
    await nativeCrypto.initializeCrypto();
    await webCrypto.initializeCrypto();
  });

  test.each(providers)("%s encrypts to the pinned fixture ciphertext", (_name, provider) => {
    const { ciphertext } = provider.encrypt({
      plaintext: bytes(vector.aead.plaintext),
      additionalData: bytes(vector.aead.aad),
      key: bytes(vector.aead.key),
      nonce: bytes(vector.aead.nonce),
    });

    expect(hex(ciphertext)).toBe(vector.aead.ciphertext);
  });

  test.each(providers)("%s derives the pinned Ed25519 identity", (_name, provider) => {
    const pair = provider.signingKeyPairFromSeed(bytes(vector.signing.seed));

    expect(hex(pair.publicKey)).toBe(vector.signing.publicKey);
    expect(hex(provider.sign(bytes(vector.signing.message), pair.privateKey))).toBe(
      vector.signing.signature,
    );
  });

  test("both report the same suite and byte lengths", () => {
    const shape = (provider: E2eeCryptoProvider) => ({
      suite: provider.suite,
      aeadKeyBytes: provider.aeadKeyBytes,
      aeadNonceBytes: provider.aeadNonceBytes,
      argon2idSaltBytes: provider.argon2idSaltBytes,
      signingSeedBytes: provider.signingSeedBytes,
      agreementSeedBytes: provider.agreementSeedBytes,
      agreementPublicKeyBytes: provider.agreementPublicKeyBytes,
      agreementPrivateKeyBytes: provider.agreementPrivateKeyBytes,
      sealedBoxOverheadBytes: provider.sealedBoxOverheadBytes,
    });

    expect(shape(webCrypto.vaultCryptoProvider)).toEqual(
      shape(nativeCrypto.vaultCryptoProvider),
    );
  });

  test("a passphrase wrapper written on one build opens on the other", () => {
    const vaultRootKey = nativeCrypto.vaultCryptoProvider.randomBytes(32);
    const passphrase = "correct-horse-battery-staple";

    const fromNative = createPassphraseKeyWrapper(nativeCrypto.vaultCryptoProvider, {
      vaultId: "00000000-0000-4000-8000-000000000001",
      vaultRootKey,
      passphrase,
    });
    const fromWeb = createPassphraseKeyWrapper(webCrypto.vaultCryptoProvider, {
      vaultId: "00000000-0000-4000-8000-000000000001",
      vaultRootKey,
      passphrase,
    });

    expect(
      openPassphraseKeyWrapper(webCrypto.vaultCryptoProvider, fromNative, passphrase),
    ).toEqual(vaultRootKey);
    expect(
      openPassphraseKeyWrapper(nativeCrypto.vaultCryptoProvider, fromWeb, passphrase),
    ).toEqual(vaultRootKey);
  });
});
