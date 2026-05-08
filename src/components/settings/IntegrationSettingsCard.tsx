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
import type { OpenAiIntegrationSummary } from "@/domain/integration/integration.types";
import {
  removeUserIntegrationSettingAction,
  setUserIntegrationSettingAction,
} from "@/server/api/integrations";

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function IntegrationSettingsCard({
  openai,
  encryptionAvailable,
}: {
  openai: Omit<OpenAiIntegrationSummary, "updatedAt"> & {
    updatedAt: string | null;
  };
  encryptionAvailable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    openai.baseUrlSource === "user" ? (openai.baseUrl ?? "") : "",
  );
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
          nextError instanceof Error ? nextError.message : "Unknown settings error.",
        );
      }
    });
  };

  const saveApiKey = () => {
    const trimmed = apiKey.trim();

    if (!trimmed) {
      setError("OpenAI API key is required.");
      return;
    }

    runAction(async () => {
      await setUserIntegrationSettingAction({
        provider: "openai",
        key: "apiKey",
        value: trimmed,
      });
      setApiKey("");
      setFeedback("OpenAI API key saved.");
    });
  };

  const removeApiKey = () => {
    runAction(async () => {
      await removeUserIntegrationSettingAction("openai", "apiKey");
      setFeedback("OpenAI API key removed. Env fallback will be used if present.");
    });
  };

  const saveBaseUrl = () => {
    const trimmed = baseUrl.trim();

    if (!trimmed) {
      setError("Base URL is required.");
      return;
    }

    runAction(async () => {
      await setUserIntegrationSettingAction({
        provider: "openai",
        key: "baseUrl",
        value: trimmed,
      });
      setFeedback("OpenAI-compatible base URL saved.");
    });
  };

  const resetBaseUrl = () => {
    runAction(async () => {
      await removeUserIntegrationSettingAction("openai", "baseUrl");
      setBaseUrl("");
      setFeedback("Custom base URL removed. Env/default base URL will be used.");
    });
  };

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Self-host & Integrations</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "grid",
              gap: "8px",
              padding: "16px",
              borderRadius: "16px",
              background: "var(--md-sys-color-surface-container)",
            }}
          >
            <strong>OpenAI / compatible provider</strong>
            <div style={{ display: "grid", gap: "6px", fontSize: "13px", color: "var(--md-sys-color-on-surface-variant)" }}>
              <span>
                API key source: <strong>{openai.apiKeySource}</strong>
                {openai.apiKeyPreview ? ` · ${openai.apiKeyPreview}` : ""}
              </span>
              <span>
                Base URL source: <strong>{openai.baseUrlSource}</strong>
                {openai.baseUrl ? ` · ${openai.baseUrl}` : ""}
              </span>
              <span>Last updated: {formatDate(openai.updatedAt)}</span>
            </div>
          </div>

          {!encryptionAvailable ? (
            <div style={{ color: "var(--md-sys-color-error)", fontSize: "13px" }}>
              Encrypted settings are disabled because APP_ENCRYPTION_KEY or AUTH_SECRET is not configured on the server.
            </div>
          ) : null}

          <div className="settings-panel">
            <label className="settings-field">
              <span>OpenAI API key</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-..."
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={isPending || !encryptionAvailable}
              />
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Button
                type="button"
                variant="filled"
                onClick={saveApiKey}
                disabled={isPending || !encryptionAvailable || !apiKey.trim()}
              >
                Save API key
              </Button>
              <Button
                type="button"
                variant="outlined"
                onClick={removeApiKey}
                disabled={isPending || openai.apiKeySource !== "user"}
              >
                Remove app key
              </Button>
            </div>
          </div>

          <div className="settings-panel">
            <label className="settings-field">
              <span>OpenAI-compatible base URL</span>
              <input
                type="url"
                autoComplete="off"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                disabled={isPending || !encryptionAvailable}
              />
            </label>
            <div style={{ fontSize: "12px", color: "var(--md-sys-color-on-surface-variant)" }}>
              Optional. Useful for OpenAI-compatible gateways and self-hosted inference endpoints.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Button
                type="button"
                variant="filled"
                onClick={saveBaseUrl}
                disabled={isPending || !encryptionAvailable || !baseUrl.trim()}
              >
                Save base URL
              </Button>
              <Button
                type="button"
                variant="outlined"
                onClick={resetBaseUrl}
                disabled={isPending || openai.baseUrlSource !== "user"}
              >
                Reset base URL
              </Button>
            </div>
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
          App-level settings are encrypted before being stored in PostgreSQL. If no app key is saved, Giraffle falls back to server env values.
        </div>
      </CardActions>
    </Card>
  );
}
