"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  createMcpAccessTokenAction,
  revokeMcpAccessTokenAction,
} from "@/server/api/mcp-tokens";
import styles from "./SettingsWorkspace.module.css";

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
  if (!value) return "Never";

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function McpAccessTokensCard({
  tokens,
}: {
  tokens: McpAccessTokenView[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("Connected app");
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
        console.error("Connected app update failed", nextError);
        setError("We couldn't update this connection. Please try again.");
      }
    });
  };

  const createToken = () => {
    const trimmedName = name.trim();

    runAction(async () => {
      const token = await createMcpAccessTokenAction({
        name: trimmedName || "Connected app",
      });
      setCreatedToken(token.token);
      setFeedback("Connection code created. Copy it now; it will not be shown again.");
    });
  };

  const revokeToken = (tokenId: string) => {
    runAction(async () => {
      await revokeMcpAccessTokenAction(tokenId);
      setFeedback("App disconnected.");
    });
  };

  return (
    <section className={styles.contentSection}>
      <div className={styles.contentSectionHeader}>
        <div>
          <h3>Connect an app</h3>
          <p>Create a code and paste it into the app you want to connect.</p>
        </div>
      </div>

      <div className={styles.formStack}>
        <label className={styles.field}>
          <span>App name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isPending}
            placeholder="Name the app"
          />
        </label>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="filled"
            onClick={createToken}
            disabled={isPending}
          >
            Create code
          </Button>
        </div>
      </div>

      {createdToken ? (
        <div className={styles.tokenReveal}>
          <strong>Copy this code now</strong>
          <code>{createdToken}</code>
        </div>
      ) : null}

      <ul className={styles.dataList}>
        {tokens.length === 0 ? (
          <li className={styles.emptyRow}>No apps connected.</li>
        ) : (
          tokens.map((token) => {
            const revoked = Boolean(token.revokedAt);
            return (
              <li key={token.id} className={styles.dataRow}>
                <span>
                  <strong>{token.name}</strong>
                  <small>
                    Added {formatDate(token.createdAt)} · Last used{" "}
                    {formatDate(token.lastUsedAt)}
                    {revoked ? ` · Disconnected ${formatDate(token.revokedAt)}` : ""}
                  </small>
                </span>
                <Button
                  type="button"
                  variant="text"
                  onClick={() => revokeToken(token.id)}
                  disabled={isPending || revoked}
                >
                  Disconnect
                </Button>
              </li>
            );
          })
        )}
      </ul>

      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.footerNote}>
        Keep connection codes private. Disconnect apps you no longer use.
      </p>
    </section>
  );
}
