export const APP_SETTING_KEYS = [
  "APP_UPDATE_REPOSITORY",
  "UPLOAD_DIR",
  "LOG_LEVEL",
] as const;

export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

export interface AppSettingSummary {
  key: AppSettingKey;
  configured: boolean;
  preview: string | null;
  source: "app" | "env" | "none";
  updatedAt: Date | null;
}

export const APP_SETTING_DESCRIPTIONS: Record<AppSettingKey, string> = {
  APP_UPDATE_REPOSITORY: "GitHub repository slug for in-app update checks (owner/repo).",
  UPLOAD_DIR: "Filesystem path for user uploads (server-side).",
  LOG_LEVEL: "Logger verbosity (debug, info, warn, error).",
};
