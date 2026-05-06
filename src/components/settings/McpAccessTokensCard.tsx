"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  createMcpAccessTokenAction,
  revokeMcpAccessTokenAction,
} from "@/server/api/mcp-tokens";

export interface McpAccessTokenView {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function McpAccessTokensCard({ tokens }: { tokens: McpAccessTokenView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("External agent");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = (task: () => Promise<void>) => {
    startTransition(async () => {
      try {
        setError(null);
        setFeedback(null);
        await task();
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "Unknown MCP token error.",
        );
      }
    });
  };

  const createToken = () => {
    const trimmedName = name.trim();

    runAction(async () => {
      const token = await createMcpAccessTokenAction({
        name: trimmedName || "External agent",
      });
      setCreatedToken(token.token);
      setFeedback("MCP token created. Copy it now; it will not be shown again.");
    });
  };

  const revokeToken = (tokenId: string) => {
    runAction(async () => {
      await revokeMcpAccessTokenAction(tokenId);
      setFeedback("MCP token revoked.");
    });
  };

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>MCP Access Tokens</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: "16px" }}>
          <div style={{ fontSize: "13px", color: "var(--md-sys-color-on-surface-variant)" }}>
            Use a personal access token as <code>Authorization: Bearer ...</code> when connecting external MCP agents to <code>/api/mcp</code>.
          </div>

          <div className="settings-panel">
            <label className="settings-field">
              <span>Token name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                placeholder="Claude Desktop, Cursor, etc."
              />
            </label>
            <Button type="button" variant="filled" onClick={createToken} disabled={isPending}>
              Create MCP token
            </Button>
          </div>

          {createdToken ? (
            <div
              style={{
                display: "grid",
                gap: "8px",
                padding: "16px",
                borderRadius: "16px",
                background: "var(--md-sys-color-primary-container)",
                color: "var(--md-sys-color-on-primary-container)",
              }}
            >
              <strong>New token</strong>
              <code style={{ overflowWrap: "anywhere" }}>{createdToken}</code>
            </div>
          ) : null}

          <div style={{ border: "1px solid var(--md-sys-color-outline-variant)", borderRadius: "var(--md-sys-shape-medium)", overflow: "hidden" }}>
            <ul className="md-list" style={{ padding: 0 }}>
              {tokens.length === 0 ? (
                <li className="md-list-item">
                  <div className="md-list-item-content">
                    <span className="md-list-item-headline" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>No MCP tokens yet.</span>
                  </div>
                </li>
              ) : (
                tokens.map((token, index) => {
                  const revoked = Boolean(token.revokedAt);
                  return (
                    <li key={token.id} className="md-list-item" style={{ borderBottom: index < tokens.length - 1 ? "1px solid var(--md-sys-color-outline-variant)" : "none" }}>
                      <div className="md-list-item-content">
                        <span className="md-list-item-headline">{token.name}</span>
                        <span className="md-list-item-supporting-text">
                          {token.tokenPrefix}… · created {formatDate(token.createdAt)} · last used {formatDate(token.lastUsedAt)}
                          {revoked ? ` · revoked ${formatDate(token.revokedAt)}` : ""}
                        </span>
                      </div>
                      <div className="md-list-item-end">
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={() => revokeToken(token.id)}
                          disabled={isPending || revoked}
                        >
                          Revoke
                        </Button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          {feedback ? (
            <div style={{ color: "var(--md-sys-color-primary)", fontSize: "13px" }}>
              {feedback}
            </div>
          ) : null}

          {error ? (
            <div style={{ color: "var(--md-sys-color-error)", fontSize: "13px" }}>
              {error}
            </div>
          ) : null}
        </div>
      </CardContent>
      <CardActions align="start">
        <div style={{ fontSize: "12px", color: "var(--md-sys-color-on-surface-variant)" }}>
          Tokens are hashed before storage. Revoke unused tokens immediately.
        </div>
      </CardActions>
    </Card>
  );
}
