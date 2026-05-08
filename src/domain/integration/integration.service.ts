import { db } from "@/lib/db";
import {
  buildSecretPreview,
  decryptSecretValue,
  encryptSecretValue,
} from "@/lib/secret-box";
import { getAppSetting } from "@/domain/app-settings/app-settings.service";
import { recordOperation } from "@/domain/sync/operation-log.service";
import type {
  IntegrationProvider,
  IntegrationSettingKey,
  OpenAiIntegrationSummary,
  UserIntegrationSettingsSummary,
} from "./integration.types";

function assertProvider(provider: string): asserts provider is IntegrationProvider {
  if (provider !== "openai") {
    throw new Error(`Unsupported integration provider: ${provider}`);
  }
}

function assertSettingKey(key: string): asserts key is IntegrationSettingKey {
  if (key !== "apiKey" && key !== "baseUrl") {
    throw new Error(`Unsupported integration setting key: ${key}`);
  }
}

async function getUserSettingRecord(
  userId: string,
  provider: IntegrationProvider,
  key: IntegrationSettingKey,
) {
  return db.userIntegrationSetting.findUnique({
    where: {
      userId_provider_settingKey: {
        userId,
        provider,
        settingKey: key,
      },
    },
    select: {
      id: true,
      encryptedValue: true,
      valuePreview: true,
      updatedAt: true,
    },
  });
}

export async function setUserIntegrationSetting(
  userId: string,
  input: {
    provider: IntegrationProvider;
    key: IntegrationSettingKey;
    value: string;
  },
) {
  const provider = input.provider.trim().toLowerCase();
  const key = input.key.trim();

  assertProvider(provider);
  assertSettingKey(key);

  const value = input.value.trim();

  if (!value) {
    throw new Error("Setting value is required.");
  }

  if (key === "baseUrl") {
    try {
      const url = new URL(value);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("baseUrl must start with http:// or https://");
      }
    } catch {
      throw new Error("baseUrl must be a valid URL.");
    }
  }

  const encryptedValue = encryptSecretValue(value);
  const valuePreview = key === "apiKey" ? buildSecretPreview(value) : value;

  const setting = await db.userIntegrationSetting.upsert({
    where: {
      userId_provider_settingKey: {
        userId,
        provider,
        settingKey: key,
      },
    },
    update: {
      encryptedValue,
      valuePreview,
    },
    create: {
      userId,
      provider,
      settingKey: key,
      encryptedValue,
      valuePreview,
    },
    select: {
      id: true,
      updatedAt: true,
      valuePreview: true,
    },
  });

  await recordOperation({
    userId,
    entityType: "integration-setting",
    entityId: setting.id,
    actionType: "upsert",
    payload: {
      provider,
      key,
      valuePreview,
    },
  });

  return setting;
}

export async function removeUserIntegrationSetting(
  userId: string,
  providerInput: IntegrationProvider,
  keyInput: IntegrationSettingKey,
) {
  const provider = providerInput.trim().toLowerCase();
  const key = keyInput.trim();

  assertProvider(provider);
  assertSettingKey(key);

  const existing = await getUserSettingRecord(userId, provider, key);

  if (!existing) {
    return false;
  }

  await db.userIntegrationSetting.delete({
    where: {
      userId_provider_settingKey: {
        userId,
        provider,
        settingKey: key,
      },
    },
  });

  await recordOperation({
    userId,
    entityType: "integration-setting",
    entityId: existing.id,
    actionType: "delete",
    payload: {
      provider,
      key,
    },
  });

  return true;
}

export async function getUserIntegrationSettingsSummary(
  userId: string,
): Promise<UserIntegrationSettingsSummary> {
  const [apiKeyRecord, baseUrlRecord] = await Promise.all([
    getUserSettingRecord(userId, "openai", "apiKey"),
    getUserSettingRecord(userId, "openai", "baseUrl"),
  ]);

  let baseUrl: string | null = null;

  if (baseUrlRecord) {
    try {
      baseUrl = decryptSecretValue(baseUrlRecord.encryptedValue);
    } catch {
      baseUrl = null;
    }
  }

  const [appApiKey, appBaseUrl] = await Promise.all([
    getAppSetting("OPENAI_API_KEY"),
    getAppSetting("OPENAI_BASE_URL"),
  ]);

  const openaiSummary: OpenAiIntegrationSummary = {
    apiKeyConfigured: Boolean(apiKeyRecord?.encryptedValue || appApiKey),
    apiKeyPreview:
      apiKeyRecord?.valuePreview ??
      (appApiKey ? buildSecretPreview(appApiKey) : null),
    apiKeySource: apiKeyRecord?.encryptedValue ? "user" : appApiKey ? "app" : "none",
    baseUrl: baseUrl || appBaseUrl,
    baseUrlSource: baseUrlRecord?.encryptedValue ? "user" : appBaseUrl ? "app" : "none",
    updatedAt: apiKeyRecord?.updatedAt ?? baseUrlRecord?.updatedAt ?? null,
  };

  return {
    openai: openaiSummary,
  };
}

export async function resolveOpenAiConfigForUser(userId: string) {
  const [apiKeyRecord, baseUrlRecord] = await Promise.all([
    getUserSettingRecord(userId, "openai", "apiKey"),
    getUserSettingRecord(userId, "openai", "baseUrl"),
  ]);

  let apiKey: string | null = null;
  let baseUrl: string | null = null;

  if (apiKeyRecord) {
    try {
      apiKey = decryptSecretValue(apiKeyRecord.encryptedValue);
    } catch {
      apiKey = null;
    }
  }

  if (baseUrlRecord) {
    try {
      baseUrl = decryptSecretValue(baseUrlRecord.encryptedValue);
    } catch {
      baseUrl = null;
    }
  }

  const [appApiKey, appBaseUrl] = await Promise.all([
    getAppSetting("OPENAI_API_KEY"),
    getAppSetting("OPENAI_BASE_URL"),
  ]);

  return {
    apiKey: apiKey || appApiKey,
    baseUrl: baseUrl || appBaseUrl,
    source: apiKey ? ("user" as const) : appApiKey ? ("app" as const) : ("none" as const),
  };
}
