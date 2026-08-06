import { decodeCanonical, encodeCanonical } from "@giraffle/protocol";
import {
  createPassphraseKeyWrapper,
  decodePassphraseKeyWrapper,
  encodePassphraseKeyWrapper,
  openPassphraseKeyWrapper,
} from "@giraffle/sync";
import { openOriginByteStore } from "../storage/originByteStore";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import {
  ARGON2ID_MEMORY_BYTES,
  ARGON2ID_OPERATIONS,
  QUICK_PIN_PATTERN,
  type LocalKeys,
  type VaultKeys,
  type VaultKeyStore,
} from "./vaultKeys.contract";

export type { LocalKeys, UnlockMethod, VaultKeys } from "./vaultKeys.contract";

const KEY_BUNDLE = "vault-keys.v1";
const PASSPHRASE_WRAPPER = "passphrase-wrapper.v1";
const PIN_WRAPPER = "quick-pin-wrapper.v1";

const BUNDLE_AAD = encodeCanonical({
  purpose: "giraffle-web-key-bundle",
  protocolVersion: 1,
  bundleVersion: 1,
  suiteId: vaultCryptoProvider.suite,
});

const NONCE_BYTES = 24;
const KEY_NAMES = [
  "vaultRootKey",
  "contentKey",
  "locatorKey",
  "signingSeed",
  "agreementSeed",
] as const satisfies readonly (keyof VaultKeys)[];

/**
 * A browser has no Keychain, so the key bundle lives in exactly two places: as
 * a ciphertext blob in origin-private storage, and — only while the vault is
 * open — in this module's closure. Nothing here is ever written in the clear,
 * and locking drops the closure, which is what makes a locked tab unreadable.
 */
let session: LocalKeys | null = null;

function sealBundle(keys: LocalKeys): Uint8Array {
  const nonce = vaultCryptoProvider.randomBytes(NONCE_BYTES);
  const plaintext = encodeCanonical({
    databaseKey: keys.databaseKey,
    vaultRootKey: keys.vaultKeys.vaultRootKey,
    contentKey: keys.vaultKeys.contentKey,
    locatorKey: keys.vaultKeys.locatorKey,
    signingSeed: keys.vaultKeys.signingSeed,
    agreementSeed: keys.vaultKeys.agreementSeed,
  });
  try {
    const { ciphertext } = vaultCryptoProvider.encrypt({
      plaintext,
      additionalData: BUNDLE_AAD,
      key: keys.vaultKeys.vaultRootKey,
      nonce,
    });
    const sealed = new Uint8Array(nonce.length + ciphertext.length);
    sealed.set(nonce, 0);
    sealed.set(ciphertext, nonce.length);
    return sealed;
  } finally {
    vaultCryptoProvider.clear(plaintext);
  }
}

function openBundle(sealed: Uint8Array, vaultRootKey: Uint8Array): LocalKeys | null {
  if (sealed.length <= NONCE_BYTES) return null;

  let plaintext: Uint8Array;
  try {
    plaintext = vaultCryptoProvider.decrypt({
      ciphertext: sealed.subarray(NONCE_BYTES),
      additionalData: BUNDLE_AAD,
      key: vaultRootKey,
      nonce: sealed.subarray(0, NONCE_BYTES),
    });
  } catch {
    return null;
  }

  try {
    const payload = decodeCanonical(plaintext) as Record<string, unknown>;
    const databaseKey = payload.databaseKey;
    if (!(databaseKey instanceof Uint8Array) || databaseKey.length !== 32) return null;

    const vaultKeys = {} as VaultKeys;
    for (const name of KEY_NAMES) {
      const value = payload[name];
      if (!(value instanceof Uint8Array) || value.length !== 32) return null;
      vaultKeys[name] = value.slice();
    }
    // The bundle is sealed under the very key it carries; a mismatch means the
    // blob was swapped for one belonging to a different vault.
    if (!vaultKeys.vaultRootKey.every((byte, index) => byte === vaultRootKey[index])) {
      return null;
    }
    return { databaseKey: databaseKey.slice(), vaultKeys };
  } catch {
    return null;
  } finally {
    vaultCryptoProvider.clear(plaintext);
  }
}

async function persist(keys: LocalKeys): Promise<void> {
  const store = await openOriginByteStore();
  await store.write(KEY_BUNDLE, sealBundle(keys));
}

async function readWrapper(name: string) {
  const store = await openOriginByteStore();
  const bytes = await store.read(name);
  if (!bytes) return null;
  try {
    return decodePassphraseKeyWrapper(bytes);
  } catch {
    return null;
  }
}

async function writeWrapper(
  name: string,
  vaultId: string,
  credential: string,
  vaultRootKey: Uint8Array,
): Promise<void> {
  const wrapper = createPassphraseKeyWrapper(vaultCryptoProvider, {
    vaultId,
    vaultRootKey,
    passphrase: credential,
    kdfOpsLimit: ARGON2ID_OPERATIONS,
    kdfMemoryBytes: ARGON2ID_MEMORY_BYTES,
  });
  const store = await openOriginByteStore();
  await store.write(name, encodePassphraseKeyWrapper(wrapper));
}

/**
 * The unlocked vault keys, for the web-only stores that have to seal their own
 * data with them. Returns null while the vault is locked, which is what keeps
 * those stores unreadable too.
 */
export function sessionVaultKeys(): VaultKeys | null {
  return session?.vaultKeys ?? null;
}

export const isValidPin: VaultKeyStore["isValidPin"] = (pin) =>
  QUICK_PIN_PATTERN.test(pin);

export const clearKeyMaterial: VaultKeyStore["clearKeyMaterial"] = (keys) => {
  keys.databaseKey.fill(0);
  Object.values(keys.vaultKeys).forEach((value) => value.fill(0));
  if (session === keys) session = null;
};

export const hasLocalVault: VaultKeyStore["hasLocalVault"] = async () => {
  const store = await openOriginByteStore();
  return (await store.read(KEY_BUNDLE)) !== null;
};

export const hasVaultWrapper: VaultKeyStore["hasVaultWrapper"] = async () => {
  const store = await openOriginByteStore();
  return (await store.read(PASSPHRASE_WRAPPER)) !== null;
};

export const hasQuickPin: VaultKeyStore["hasQuickPin"] = async () => {
  const store = await openOriginByteStore();
  return (await store.read(PIN_WRAPPER)) !== null;
};

export const createLocalKeys: VaultKeyStore["createLocalKeys"] = async () => {
  const keys: LocalKeys = {
    databaseKey: vaultCryptoProvider.randomBytes(32),
    vaultKeys: {
      vaultRootKey: vaultCryptoProvider.randomBytes(32),
      contentKey: vaultCryptoProvider.randomBytes(32),
      locatorKey: vaultCryptoProvider.randomBytes(32),
      signingSeed: vaultCryptoProvider.randomBytes(32),
      agreementSeed: vaultCryptoProvider.randomBytes(32),
    },
  };
  await persist(keys);
  session = keys;
  return keys;
};

export const saveVaultKeys: VaultKeyStore["saveVaultKeys"] = async (vaultKeys) => {
  if (!session) throw new Error("Vault is locked");
  session = { databaseKey: session.databaseKey, vaultKeys };
  await persist(session);
};

export const createPassphraseWrapper: VaultKeyStore["createPassphraseWrapper"] =
  (vaultId, passphrase, vaultRootKey) =>
    writeWrapper(PASSPHRASE_WRAPPER, vaultId, passphrase, vaultRootKey);

export const createQuickPin: VaultKeyStore["createQuickPin"] = async (
  vaultId,
  pin,
  vaultRootKey,
) => {
  if (!isValidPin(pin)) throw new Error("PIN must contain exactly 4 digits");
  await writeWrapper(PIN_WRAPPER, vaultId, pin, vaultRootKey);
};

/**
 * The whole key chain is rebuilt from the credential on every unlock: Argon2id
 * turns it into the wrapping key, that opens the Vault Root Key, and the Vault
 * Root Key opens the bundle. No step of it survives a lock or a page reload.
 */
export const unlockLocalKeys: VaultKeyStore["unlockLocalKeys"] = async (
  credential,
  method,
) => {
  if (method === "pin" && !isValidPin(credential)) return null;

  const wrapper = await readWrapper(
    method === "pin" ? PIN_WRAPPER : PASSPHRASE_WRAPPER,
  );
  if (!wrapper) return null;

  let vaultRootKey: Uint8Array;
  try {
    vaultRootKey = openPassphraseKeyWrapper(vaultCryptoProvider, wrapper, credential);
  } catch {
    return null;
  }

  try {
    const store = await openOriginByteStore();
    const sealed = await store.read(KEY_BUNDLE);
    if (!sealed) return null;

    const keys = openBundle(sealed, vaultRootKey);
    if (keys) session = keys;
    return keys;
  } finally {
    vaultCryptoProvider.clear(vaultRootKey);
  }
};

export const clearQuickPin: VaultKeyStore["clearQuickPin"] = async () => {
  const store = await openOriginByteStore();
  await store.remove(PIN_WRAPPER);
};

export const clearVaultWrapper: VaultKeyStore["clearVaultWrapper"] = async () => {
  const store = await openOriginByteStore();
  await store.remove(PASSPHRASE_WRAPPER);
};

export const clearLocalKeys: VaultKeyStore["clearLocalKeys"] = async () => {
  if (session) clearKeyMaterial(session);
  session = null;
  const store = await openOriginByteStore();
  await store.remove(KEY_BUNDLE);
};
