import * as SecureStore from "expo-secure-store";
import {
  normalizeSyncConfiguration,
  type SyncConfigurationStore,
} from "./syncConfiguration.contract";

export type { SyncConfiguration } from "./syncConfiguration.contract";

const SERVER_KEY = "giraffle.sync-server.v1";
const TOKEN_KEY = "giraffle.sync-token.v1";

export const saveSyncConfiguration: SyncConfigurationStore["saveSyncConfiguration"] =
  async (value) => {
    const { baseUrl, token } = normalizeSyncConfiguration(value);
    await Promise.all([
      SecureStore.setItemAsync(SERVER_KEY, baseUrl),
      SecureStore.setItemAsync(TOKEN_KEY, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    ]);
  };

export const loadSyncConfiguration: SyncConfigurationStore["loadSyncConfiguration"] =
  async () => {
    const [baseUrl, token] = await Promise.all([
      SecureStore.getItemAsync(SERVER_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
    ]);
    return baseUrl && token ? { baseUrl, token } : null;
  };

export const clearSyncConfiguration: SyncConfigurationStore["clearSyncConfiguration"] =
  async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SERVER_KEY),
      SecureStore.deleteItemAsync(TOKEN_KEY),
    ]);
  };
