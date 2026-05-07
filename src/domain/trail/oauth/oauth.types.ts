import type { TrailKind } from "@/domain/trail/trail.types";

export interface OAuthProviderConfig {
  kind: TrailKind;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizationUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  /**
   * Extra params merged into the authorize URL.
   */
  authorizeExtraParams?: Record<string, string>;
  /**
   * If the provider returns a refresh token only on first consent, set true.
   */
  refreshTokenStickiness?: boolean;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string;
  raw: Record<string, unknown>;
}

export type ProviderToolBuilder = (input: {
  userId: string;
  trailId: string;
  trailLabel: string | null;
  /**
   * Yields a fresh access token, refreshing if necessary.
   */
  getAccessToken: () => Promise<string>;
}) => Record<string, unknown>;
