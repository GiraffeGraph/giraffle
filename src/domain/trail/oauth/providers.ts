import type { TrailKind } from "@/domain/trail/trail.types";
import { getAppSetting } from "@/domain/app-settings/app-settings.service";
import type { AppSettingKey } from "@/domain/app-settings/app-settings.types";
import type { OAuthProviderConfig } from "./oauth.types";

export const OAUTH_PROVIDERS: Partial<Record<TrailKind, OAuthProviderConfig>> = {
  github: {
    kind: "github",
    clientIdEnv: "TRAIL_GITHUB_CLIENT_ID",
    clientSecretEnv: "TRAIL_GITHUB_CLIENT_SECRET",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultScopes: ["read:user", "repo", "read:org"],
  },
  google_drive: {
    kind: "google_drive",
    clientIdEnv: "TRAIL_GOOGLE_CLIENT_ID",
    clientSecretEnv: "TRAIL_GOOGLE_CLIENT_SECRET",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    authorizeExtraParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    refreshTokenStickiness: true,
  },
  google_calendar: {
    kind: "google_calendar",
    clientIdEnv: "TRAIL_GOOGLE_CLIENT_ID",
    clientSecretEnv: "TRAIL_GOOGLE_CLIENT_SECRET",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    authorizeExtraParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    refreshTokenStickiness: true,
  },
  notion: {
    kind: "notion",
    clientIdEnv: "TRAIL_NOTION_CLIENT_ID",
    clientSecretEnv: "TRAIL_NOTION_CLIENT_SECRET",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    defaultScopes: [],
    authorizeExtraParams: { owner: "user" },
  },
  linear: {
    kind: "linear",
    clientIdEnv: "TRAIL_LINEAR_CLIENT_ID",
    clientSecretEnv: "TRAIL_LINEAR_CLIENT_SECRET",
    authorizationUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    defaultScopes: ["read", "write"],
    authorizeExtraParams: { prompt: "consent" },
  },
};

export async function resolveOAuthCredentials(
  kind: TrailKind,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const cfg = OAUTH_PROVIDERS[kind];
  if (!cfg) return null;

  const [clientId, clientSecret] = await Promise.all([
    getAppSetting(cfg.clientIdEnv as AppSettingKey),
    getAppSetting(cfg.clientSecretEnv as AppSettingKey),
  ]);

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function isOAuthEnabled(kind: TrailKind): Promise<boolean> {
  return (await resolveOAuthCredentials(kind)) !== null;
}

export function getOAuthConfig(kind: TrailKind): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[kind] ?? null;
}
