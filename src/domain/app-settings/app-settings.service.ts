import { db } from "@/lib/db";
import {
  buildSecretPreview,
  decryptSecretValue,
  encryptSecretValue,
} from "@/lib/secret-box";
import {
  APP_SETTING_KEYS,
  type AppSettingKey,
  type AppSettingSummary,
} from "./app-settings.types";

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  value: string | null;
  expiresAt: number;
};

const cache = new Map<AppSettingKey, CacheEntry>();

function assertKey(key: string): asserts key is AppSettingKey {
  if (!(APP_SETTING_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown app setting key: ${key}`);
  }
}

export function invalidateAppSettingCache(key?: AppSettingKey) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

async function readFromDb(key: AppSettingKey): Promise<string | null> {
  const record = await db.appSetting.findUnique({
    where: { key },
    select: { encryptedValue: true },
  });

  if (!record) return null;

  try {
    return decryptSecretValue(record.encryptedValue);
  } catch {
    return null;
  }
}

export async function getAppSetting(key: AppSettingKey): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const dbValue = await readFromDb(key);

  if (dbValue !== null) {
    cache.set(key, { value: dbValue, expiresAt: now + CACHE_TTL_MS });
    return dbValue;
  }

  const envValue = process.env[key]?.trim() || null;
  cache.set(key, { value: envValue, expiresAt: now + CACHE_TTL_MS });
  return envValue;
}

export async function getAppSettingSource(
  key: AppSettingKey,
): Promise<"app" | "env" | "none"> {
  const dbValue = await readFromDb(key);
  if (dbValue !== null) return "app";
  if (process.env[key]?.trim()) return "env";
  return "none";
}

export async function setAppSetting(
  key: AppSettingKey,
  value: string,
  updatedBy: string | null = null,
): Promise<void> {
  assertKey(key);

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Value is required.");
  }

  const encryptedValue = encryptSecretValue(trimmed);
  const valuePreview = buildSecretPreview(trimmed);

  await db.appSetting.upsert({
    where: { key },
    create: {
      key,
      encryptedValue,
      valuePreview,
      updatedBy,
    },
    update: {
      encryptedValue,
      valuePreview,
      updatedBy,
    },
  });

  invalidateAppSettingCache(key);
}

export async function deleteAppSetting(key: AppSettingKey): Promise<void> {
  assertKey(key);

  await db.appSetting.deleteMany({ where: { key } });
  invalidateAppSettingCache(key);
}

export async function listAppSettings(): Promise<AppSettingSummary[]> {
  const records = await db.appSetting.findMany({
    select: { key: true, valuePreview: true, updatedAt: true },
  });
  const byKey = new Map(records.map((r) => [r.key, r]));

  return APP_SETTING_KEYS.map((key) => {
    const record = byKey.get(key);
    const envValue = process.env[key]?.trim() || null;

    return {
      key,
      configured: Boolean(record || envValue),
      preview:
        record?.valuePreview ?? (envValue ? buildSecretPreview(envValue) : null),
      source: record ? "app" : envValue ? "env" : "none",
      updatedAt: record?.updatedAt ?? null,
    } satisfies AppSettingSummary;
  });
}
