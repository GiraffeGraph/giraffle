export interface McpAccessTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedMcpAccessToken extends McpAccessTokenSummary {
  token: string;
}
