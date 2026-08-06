export interface SyncConfiguration {
  baseUrl: string;
  token: string;
}

/**
 * Where the relay address and its bearer token are kept between launches.
 * The token authorises pushing and pulling ciphertext; it never decrypts
 * anything, but it does identify the vault, so it is stored as a secret.
 */
export interface SyncConfigurationStore {
  saveSyncConfiguration(value: SyncConfiguration): Promise<void>;
  loadSyncConfiguration(): Promise<SyncConfiguration | null>;
  clearSyncConfiguration(): Promise<void>;
}

export function normalizeSyncConfiguration(
  value: SyncConfiguration,
): SyncConfiguration {
  const baseUrl = value.baseUrl.trim().replace(/\/+$/, "");
  const token = value.token.trim();
  if (!baseUrl || !token) {
    throw new Error("Server address and connection code are required");
  }
  return { baseUrl, token };
}
