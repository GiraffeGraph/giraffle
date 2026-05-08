export const INTEGRATION_PROVIDERS = ["openai"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_SETTING_KEYS = ["apiKey", "baseUrl"] as const;
export type IntegrationSettingKey = (typeof INTEGRATION_SETTING_KEYS)[number];

export interface IntegrationSettingSummary {
  provider: IntegrationProvider;
  key: IntegrationSettingKey;
  configured: boolean;
  preview: string | null;
  updatedAt: Date | null;
}

export type IntegrationSettingSource = "user" | "app" | "none";

export interface OpenAiIntegrationSummary {
  apiKeyConfigured: boolean;
  apiKeyPreview: string | null;
  apiKeySource: IntegrationSettingSource;
  baseUrl: string | null;
  baseUrlSource: IntegrationSettingSource;
  updatedAt: Date | null;
}

export interface UserIntegrationSettingsSummary {
  openai: OpenAiIntegrationSummary;
}
