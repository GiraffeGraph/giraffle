export const APP_SETTING_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "TRAIL_GITHUB_CLIENT_ID",
  "TRAIL_GITHUB_CLIENT_SECRET",
  "TRAIL_GOOGLE_CLIENT_ID",
  "TRAIL_GOOGLE_CLIENT_SECRET",
  "TRAIL_NOTION_CLIENT_ID",
  "TRAIL_NOTION_CLIENT_SECRET",
  "TRAIL_LINEAR_CLIENT_ID",
  "TRAIL_LINEAR_CLIENT_SECRET",
  "TRAIL_OAUTH_PUBLIC_ORIGIN",
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
  OPENAI_API_KEY: "OpenAI API key for AI features.",
  OPENAI_BASE_URL: "Override OpenAI API base URL (proxy/self-hosted).",
  TRAIL_GITHUB_CLIENT_ID: "GitHub OAuth client ID.",
  TRAIL_GITHUB_CLIENT_SECRET: "GitHub OAuth client secret.",
  TRAIL_GOOGLE_CLIENT_ID: "Google OAuth client ID (Drive + Calendar).",
  TRAIL_GOOGLE_CLIENT_SECRET: "Google OAuth client secret.",
  TRAIL_NOTION_CLIENT_ID: "Notion OAuth client ID.",
  TRAIL_NOTION_CLIENT_SECRET: "Notion OAuth client secret.",
  TRAIL_LINEAR_CLIENT_ID: "Linear OAuth client ID.",
  TRAIL_LINEAR_CLIENT_SECRET: "Linear OAuth client secret.",
  TRAIL_OAUTH_PUBLIC_ORIGIN: "Override OAuth callback origin (defaults to NEXTAUTH_URL).",
  APP_UPDATE_REPOSITORY: "GitHub repository slug for in-app update checks (owner/repo).",
  UPLOAD_DIR: "Filesystem path for user uploads (server-side).",
  LOG_LEVEL: "Logger verbosity (debug, info, warn, error).",
};
