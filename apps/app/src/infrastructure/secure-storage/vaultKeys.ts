import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode as decodeCbor, encode as encodeCbor } from "cborg";
import * as SecureStore from "expo-secure-store";
import {
  decrypt,
  derivePassphraseKey,
  encrypt,
  randomBytes,
  zeroize,
} from "../crypto/vaultCrypto";
import {
  createRecoveryKeyWrapper,
  decodeRecoveryKeyWrapper,
  encodeRecoveryKeyWrapper,
  formatRecoveryCode,
  openRecoveryKeyWrapper,
  RECOVERY_SECRET_BYTES,
} from "@giraffle/sync";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import { decodeKey, encodeKey } from "./keyEncoding";
import {
  ARGON2ID_MEMORY_BYTES,
  ARGON2ID_OPERATIONS,
  QUICK_PIN_PATTERN,
  type LocalKeys,
  type VaultKeys,
  type VaultKeyStore,
} from "./vaultKeys.contract";

export type { LocalKeys, UnlockMethod, VaultKeys } from "./vaultKeys.contract";

const DB_KEY = "giraffle.sqlcipher-key.v1";
const VAULT_KEYS = "giraffle.vault-keys.v1";
const VAULT_MARKER = "giraffle.vault-marker.v1";
const PASSPHRASE_WRAPPER_KEY = "giraffle.passphrase-wrapper.v1";
const PIN_WRAPPER_KEY = "giraffle.quick-pin-wrapper.v1";
const RECOVERY_WRAPPER_KEY = "giraffle.recovery-wrapper.v1";

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface StoredWrapper {
  version: 1;
  vaultId: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  operations: number;
  memoryBytes: number;
}

type WrapperContext = Pick<StoredWrapper, "vaultId" | "operations" | "memoryBytes">;

// Both wrappers bind their key-derivation parameters into the AEAD's
// additional data, so a downgraded Argon2id cost cannot be swapped in. The two
// shapes differ because each one is what already sits in the Keychain.
const PASSPHRASE_AAD = (wrapper: WrapperContext) =>
  encodeCbor({
    protocolVersion: 1,
    wrapperVersion: 1,
    suiteId: "xchacha20poly1305-argon2id-ed25519-v1",
    vaultId: wrapper.vaultId,
    operations: wrapper.operations,
    memoryBytes: wrapper.memoryBytes,
  });

const QUICK_PIN_AAD = (wrapper: WrapperContext) =>
  encodeCbor({
    purpose: "giraffle-device-quick-pin",
    protocolVersion: 1,
    wrapperVersion: 1,
    vaultId: wrapper.vaultId,
    operations: wrapper.operations,
    memoryBytes: wrapper.memoryBytes,
  });

async function sealVaultRootKey(
  aad: (wrapper: WrapperContext) => Uint8Array,
  vaultId: string,
  credential: string,
  vaultRootKey: Uint8Array,
): Promise<StoredWrapper> {
  const salt = randomBytes(16);
  const key = await derivePassphraseKey(
    credential,
    salt,
    ARGON2ID_OPERATIONS,
    ARGON2ID_MEMORY_BYTES,
  );
  const payload = encodeCbor({ vaultId, protocolVersion: 1, vaultRootKey });
  try {
    const sealed = encrypt(
      payload,
      aad({
        vaultId,
        operations: ARGON2ID_OPERATIONS,
        memoryBytes: ARGON2ID_MEMORY_BYTES,
      }),
      key,
    );
    return {
      version: 1,
      vaultId,
      salt: encodeKey(salt),
      nonce: encodeKey(sealed.nonce),
      ciphertext: encodeKey(sealed.ciphertext),
      operations: ARGON2ID_OPERATIONS,
      memoryBytes: ARGON2ID_MEMORY_BYTES,
    };
  } finally {
    zeroize(key, salt, payload);
  }
}

/** The recovery wrapper is the package's, so opening it is the package's job. */
async function openRecovery(code: string): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(RECOVERY_WRAPPER_KEY, KEYCHAIN);
  if (!stored) return null;
  try {
    return openRecoveryKeyWrapper(
      vaultCryptoProvider,
      decodeRecoveryKeyWrapper(decodeKey(stored)),
      code,
    );
  } catch {
    return null;
  }
}

async function openVaultRootKey(
  aad: (wrapper: WrapperContext) => Uint8Array,
  raw: string | null,
  credential: string,
): Promise<Uint8Array | null> {
  if (!raw) return null;
  const wrapper = JSON.parse(raw) as StoredWrapper;
  const salt = decodeKey(wrapper.salt);
  const key = await derivePassphraseKey(
    credential,
    salt,
    wrapper.operations,
    wrapper.memoryBytes,
  );

  let opened: Uint8Array | null = null;
  try {
    opened = decrypt(
      decodeKey(wrapper.ciphertext),
      aad(wrapper),
      key,
      decodeKey(wrapper.nonce),
    );
    const decoded = decodeCbor(opened) as { vaultRootKey?: Uint8Array };
    return decoded.vaultRootKey instanceof Uint8Array
      ? decoded.vaultRootKey.slice()
      : null;
  } catch {
    return null;
  } finally {
    zeroize(key, salt);
    if (opened) zeroize(opened);
  }
}

function sameKey(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

async function writeVaultKeys(vaultKeys: VaultKeys): Promise<void> {
  await SecureStore.setItemAsync(
    VAULT_KEYS,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(vaultKeys).map(([key, value]) => [key, encodeKey(value)]),
      ),
    ),
    KEYCHAIN,
  );
}

export const isValidPin: VaultKeyStore["isValidPin"] = (pin) =>
  QUICK_PIN_PATTERN.test(pin);

export const clearKeyMaterial: VaultKeyStore["clearKeyMaterial"] = (keys) => {
  keys.databaseKey.fill(0);
  Object.values(keys.vaultKeys).forEach((value) => value.fill(0));
};

export const hasLocalVault: VaultKeyStore["hasLocalVault"] = async () =>
  (await SecureStore.getItemAsync(VAULT_MARKER)) === "1";

export const hasVaultWrapper: VaultKeyStore["hasVaultWrapper"] = async () =>
  (await AsyncStorage.getItem(PASSPHRASE_WRAPPER_KEY)) !== null;

export const hasQuickPin: VaultKeyStore["hasQuickPin"] = async () =>
  (await SecureStore.getItemAsync(PIN_WRAPPER_KEY)) !== null;

export const createLocalKeys: VaultKeyStore["createLocalKeys"] = async () => {
  const databaseKey = randomBytes(32);
  const vaultKeys: VaultKeys = {
    vaultRootKey: randomBytes(32),
    contentKey: randomBytes(32),
    locatorKey: randomBytes(32),
    signingSeed: randomBytes(32),
    agreementSeed: randomBytes(32),
  };
  await SecureStore.setItemAsync(DB_KEY, encodeKey(databaseKey), KEYCHAIN);
  await writeVaultKeys(vaultKeys);
  await SecureStore.setItemAsync(VAULT_MARKER, "1", KEYCHAIN);
  return { databaseKey, vaultKeys };
};

export const saveVaultKeys: VaultKeyStore["saveVaultKeys"] = async (vaultKeys) => {
  await writeVaultKeys(vaultKeys);
};

export const createPassphraseWrapper: VaultKeyStore["createPassphraseWrapper"] =
  async (vaultId, passphrase, vaultRootKey) => {
    const wrapper = await sealVaultRootKey(
      PASSPHRASE_AAD,
      vaultId,
      passphrase,
      vaultRootKey,
    );
    await AsyncStorage.setItem(PASSPHRASE_WRAPPER_KEY, JSON.stringify(wrapper));
  };

export const createQuickPin: VaultKeyStore["createQuickPin"] = async (
  vaultId,
  pin,
  vaultRootKey,
) => {
  if (!isValidPin(pin)) throw new Error("PIN must contain exactly 4 digits");
  const wrapper = await sealVaultRootKey(
    QUICK_PIN_AAD,
    vaultId,
    pin,
    vaultRootKey,
  );
  await SecureStore.setItemAsync(
    PIN_WRAPPER_KEY,
    JSON.stringify(wrapper),
    KEYCHAIN,
  );
};

/**
 * The Keychain hands back the key material, but only a credential that opens
 * the matching wrapper proves the human is present — so the keys are released
 * to the caller solely when the two agree on the same Vault Root Key.
 */
export const hasRecoveryWrapper: VaultKeyStore["hasRecoveryWrapper"] = async () =>
  (await SecureStore.getItemAsync(RECOVERY_WRAPPER_KEY, KEYCHAIN)) !== null;

export const createRecoveryWrapper: VaultKeyStore["createRecoveryWrapper"] = async (
  vaultId,
  vaultRootKey,
) => {
  const secret = vaultCryptoProvider.randomBytes(RECOVERY_SECRET_BYTES);
  try {
    const wrapper = createRecoveryKeyWrapper(vaultCryptoProvider, {
      vaultId,
      vaultRootKey,
      recoverySecret: secret,
    });
    await SecureStore.setItemAsync(
      RECOVERY_WRAPPER_KEY,
      encodeKey(encodeRecoveryKeyWrapper(wrapper)),
      KEYCHAIN,
    );
    return formatRecoveryCode(vaultCryptoProvider, secret);
  } finally {
    zeroize(secret);
  }
};

export const clearRecoveryWrapper: VaultKeyStore["clearRecoveryWrapper"] = async () => {
  await SecureStore.deleteItemAsync(RECOVERY_WRAPPER_KEY, KEYCHAIN);
};

export const unlockLocalKeys: VaultKeyStore["unlockLocalKeys"] = async (
  credential,
  method,
) => {
  if (method === "pin" && !isValidPin(credential)) return null;

  const [db, raw] = await Promise.all([
    SecureStore.getItemAsync(DB_KEY, KEYCHAIN),
    SecureStore.getItemAsync(VAULT_KEYS, KEYCHAIN),
  ]);
  if (!db || !raw) return null;

  const parsed = JSON.parse(raw) as Record<keyof VaultKeys, string>;
  const keys: LocalKeys = {
    databaseKey: decodeKey(db),
    vaultKeys: {
      vaultRootKey: decodeKey(parsed.vaultRootKey),
      contentKey: decodeKey(parsed.contentKey),
      locatorKey: decodeKey(parsed.locatorKey),
      signingSeed: decodeKey(parsed.signingSeed),
      agreementSeed: decodeKey(parsed.agreementSeed),
    },
  };

  const opened =
    method === "recovery"
      ? await openRecovery(credential)
      : method === "pin"
      ? await openVaultRootKey(
          QUICK_PIN_AAD,
          await SecureStore.getItemAsync(PIN_WRAPPER_KEY, KEYCHAIN),
          credential,
        )
      : await openVaultRootKey(
          PASSPHRASE_AAD,
          await AsyncStorage.getItem(PASSPHRASE_WRAPPER_KEY),
          credential,
        );

  if (!opened || !sameKey(opened, keys.vaultKeys.vaultRootKey)) {
    if (opened) zeroize(opened);
    clearKeyMaterial(keys);
    return null;
  }
  zeroize(opened);
  return keys;
};

export const clearQuickPin: VaultKeyStore["clearQuickPin"] = async () => {
  await SecureStore.deleteItemAsync(PIN_WRAPPER_KEY);
};

export const clearVaultWrapper: VaultKeyStore["clearVaultWrapper"] = async () => {
  await AsyncStorage.removeItem(PASSPHRASE_WRAPPER_KEY);
};

export const clearLocalKeys: VaultKeyStore["clearLocalKeys"] = async () => {
  await Promise.all(
    [DB_KEY, VAULT_KEYS, VAULT_MARKER].map((key) =>
      SecureStore.deleteItemAsync(key),
    ),
  );
};
