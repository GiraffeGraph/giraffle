import { decodeCanonical, encodeCanonical } from "@giraffle/protocol";
import { sessionVaultKeys } from "../secure-storage/vaultKeys.web";
import { openOriginByteStore } from "../storage/originByteStore";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import {
  normalizeSyncConfiguration,
  type SyncConfiguration,
  type SyncConfigurationStore,
} from "./syncConfiguration.contract";

export type { SyncConfiguration } from "./syncConfiguration.contract";

const CONFIGURATION = "sync-configuration.v1";
const NONCE_BYTES = 24;
const AAD = encodeCanonical({
  purpose: "giraffle-web-sync-configuration",
  protocolVersion: 1,
  version: 1,
});

/**
 * A browser has no Keychain to put a bearer token in, so the relay credentials
 * are sealed with the vault's content key instead. That ties them to the same
 * unlock as the notes: a locked tab cannot read the token any more than it can
 * read a page.
 */
export const saveSyncConfiguration: SyncConfigurationStore["saveSyncConfiguration"] =
  async (value) => {
    const keys = sessionVaultKeys();
    if (!keys) throw new Error("Vault is locked");

    const normalized = normalizeSyncConfiguration(value);
    const nonce = vaultCryptoProvider.randomBytes(NONCE_BYTES);
    const plaintext = encodeCanonical(normalized);
    try {
      const { ciphertext } = vaultCryptoProvider.encrypt({
        plaintext,
        additionalData: AAD,
        key: keys.contentKey,
        nonce,
      });
      const sealed = new Uint8Array(nonce.length + ciphertext.length);
      sealed.set(nonce, 0);
      sealed.set(ciphertext, nonce.length);
      const store = await openOriginByteStore();
      await store.write(CONFIGURATION, sealed);
    } finally {
      vaultCryptoProvider.clear(plaintext);
    }
  };

export const loadSyncConfiguration: SyncConfigurationStore["loadSyncConfiguration"] =
  async () => {
    const keys = sessionVaultKeys();
    if (!keys) return null;

    const store = await openOriginByteStore();
    const sealed = await store.read(CONFIGURATION);
    if (!sealed || sealed.length <= NONCE_BYTES) return null;

    let plaintext: Uint8Array;
    try {
      plaintext = vaultCryptoProvider.decrypt({
        ciphertext: sealed.subarray(NONCE_BYTES),
        additionalData: AAD,
        key: keys.contentKey,
        nonce: sealed.subarray(0, NONCE_BYTES),
      });
    } catch {
      return null;
    }

    try {
      const decoded = decodeCanonical(plaintext) as Partial<SyncConfiguration>;
      return typeof decoded.baseUrl === "string" && typeof decoded.token === "string"
        ? { baseUrl: decoded.baseUrl, token: decoded.token }
        : null;
    } catch {
      return null;
    } finally {
      vaultCryptoProvider.clear(plaintext);
    }
  };

export const clearSyncConfiguration: SyncConfigurationStore["clearSyncConfiguration"] =
  async () => {
    const store = await openOriginByteStore();
    await store.remove(CONFIGURATION);
  };
