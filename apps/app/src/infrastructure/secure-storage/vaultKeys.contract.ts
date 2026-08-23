export interface VaultKeys {
  vaultRootKey: Uint8Array;
  contentKey: Uint8Array;
  locatorKey: Uint8Array;
  signingSeed: Uint8Array;
  agreementSeed: Uint8Array;
}

/** The database key sits beside the vault keys but never leaves the device. */
export interface LocalKeys {
  databaseKey: Uint8Array;
  vaultKeys: VaultKeys;
}

export type UnlockMethod = "passphrase" | "pin" | "recovery";

/**
 * The one contract `vaultKeys.ts` (Keychain / Keystore) and `vaultKeys.web.ts`
 * (origin-private ciphertext) both implement, so nothing above this layer has
 * to know which one it is talking to.
 *
 * Unlocking is part of the contract rather than something a caller assembles
 * from a load plus a verify: on the web the keys do not exist until a
 * credential produces them, so the two steps cannot be separated.
 */
export interface VaultKeyStore {
  /** Whether this device holds key material for a vault. */
  hasLocalVault(): Promise<boolean>;
  /** Whether a passphrase wrapper exists to unlock that material with. */
  hasVaultWrapper(): Promise<boolean>;
  hasQuickPin(): Promise<boolean>;
  /** Whether a recovery code can still open this vault. */
  hasRecoveryWrapper(): Promise<boolean>;
  createLocalKeys(): Promise<LocalKeys>;
  /** Replaces the vault-wide secrets once a trusted device has sealed them here. */
  saveVaultKeys(vaultKeys: VaultKeys): Promise<void>;
  createPassphraseWrapper(
    vaultId: string,
    passphrase: string,
    vaultRootKey: Uint8Array,
  ): Promise<void>;
  createQuickPin(
    vaultId: string,
    pin: string,
    vaultRootKey: Uint8Array,
  ): Promise<void>;
  /**
   * Mints the recovery secret, seals the Vault Root Key to it, and returns the
   * code to show once. The secret exists only inside this call: what is kept is
   * the wrapper, and what opens it is the code the person wrote down.
   */
  createRecoveryWrapper(vaultId: string, vaultRootKey: Uint8Array): Promise<string>;
  /** `null` when the credential does not open this vault. */
  unlockLocalKeys(
    credential: string,
    method: UnlockMethod,
  ): Promise<LocalKeys | null>;
  clearQuickPin(): Promise<void>;
  clearRecoveryWrapper(): Promise<void>;
  clearVaultWrapper(): Promise<void>;
  clearLocalKeys(): Promise<void>;
  clearKeyMaterial(keys: LocalKeys): void;
  isValidPin(pin: string): boolean;
}

export const QUICK_PIN_PATTERN = /^\d{4}$/;
export const ARGON2ID_OPERATIONS = 2;
export const ARGON2ID_MEMORY_BYTES = 64 * 1024 * 1024;
