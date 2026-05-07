import { logger } from "@/lib/logger";
import type { OAuthProviderConfig, OAuthTokenResponse } from "./oauth.types";

export interface ExchangeInput {
  config: OAuthProviderConfig;
  code: string;
  redirectUri: string;
}

export interface RefreshInput {
  config: OAuthProviderConfig;
  refreshToken: string;
}

interface RawTokenJson {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function postTokenRequest(
  config: OAuthProviderConfig,
  body: URLSearchParams,
  options: { useBasicAuth: boolean },
): Promise<OAuthTokenResponse> {
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(`Missing OAuth credentials for ${config.kind}`);
  }
  if (options.useBasicAuth) {
    body.delete("client_id");
    body.delete("client_secret");
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (options.useBasicAuth) headers.Authorization = basicAuthHeader(clientId, clientSecret);
  if (config.kind === "notion") {
    headers["Notion-Version"] = "2022-06-28";
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body,
  });
  const text = await response.text();
  let json: RawTokenJson;
  try {
    json = JSON.parse(text) as RawTokenJson;
  } catch {
    throw new Error(`Token endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!response.ok || json.error) {
    const message = json.error_description ?? json.error ?? response.statusText;
    logger.warn("trail_oauth_exchange_failed", { kind: config.kind, status: response.status, message });
    throw new Error(`OAuth exchange failed: ${message}`);
  }
  if (!json.access_token) {
    throw new Error("OAuth exchange missing access_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    scope: json.scope ?? null,
    tokenType: json.token_type ?? "Bearer",
    raw: json as Record<string, unknown>,
  };
}

export async function exchangeCodeForTokens(input: ExchangeInput): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const useBasicAuth = input.config.kind === "notion";
  return postTokenRequest(input.config, body, { useBasicAuth });
}

export async function refreshAccessToken(input: RefreshInput): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  const useBasicAuth = input.config.kind === "notion";
  return postTokenRequest(input.config, body, { useBasicAuth });
}
