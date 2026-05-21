"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
} from "@/components/ui/Card";
import type { AppSettingKey } from "@/domain/app-settings/app-settings.types";
import {
  deleteAppSettingAction,
  setAppSettingAction,
} from "@/server/api/app-settings";

interface SecretItem {
  key: AppSettingKey;
  description: string;
  configured: boolean;
  preview: string | null;
  source: "app" | "env" | "none";
  updatedAt: string | null;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sourceLabel(source: SecretItem["source"]) {
  switch (source) {
    case "app":
      return "DB (in-app)";
    case "env":
      return "ENV (legacy)";
    default:
      return "Not set";
  }
}

export function SecretsManagerCard({
  items,
  encryptionAvailable,
}: {
  items: SecretItem[];
  encryptionAvailable: boolean;
}) {
  if (!encryptionAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App secrets</CardTitle>
          <CardSubtitle>
            AUTH_SECRET (or APP_ENCRYPTION_KEY) must be set before secrets can
            be stored.
          </CardSubtitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>App secrets</CardTitle>
        <CardSubtitle>
          Store API keys and runtime config in the database. Values are
          AES-256-GCM encrypted with your AUTH_SECRET. Bootstrap-only env vars
          (DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL) are excluded.
        </CardSubtitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((item) => (
            <SecretRow key={item.key} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SecretRow({ item }: { item: SecretItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reset = () => {
    setEditing(false);
    setValue("");
    setError(null);
  };

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Value is required.");
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        await setAppSettingAction({ key: item.key, value: trimmed });
        setFeedback("Saved");
        reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: "Delete secret?",
      message: `Delete ${item.key} from the database?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        setError(null);
        await deleteAppSettingAction(item.key);
        setFeedback("Removed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Remove failed.");
      }
    });
  };

  return (
    <div
      style={{
        border: "1px solid var(--md-color-outline-variant, #ddd)",
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <code style={{ fontSize: 13, fontWeight: 600 }}>{item.key}</code>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            {item.description}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--md-color-surface-container, #eee)",
            opacity: 0.8,
          }}
        >
          {sourceLabel(item.source)}
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
        {item.configured ? (
          <span>
            Current: <strong>{item.preview ?? "•••"}</strong> · Updated{" "}
            {formatDate(item.updatedAt)}
          </span>
        ) : (
          <span>Not configured</span>
        )}
      </div>

      {editing ? (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`New value for ${item.key}`}
            disabled={isPending}
            autoFocus
            style={{
              padding: "8px 10px",
              border: "1px solid var(--md-color-outline-variant, #ccc)",
              borderRadius: 6,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          {error && <div style={{ color: "var(--md-color-error, #b00)", fontSize: 12 }}>{error}</div>}
          <CardActions align="end">
            <Button variant="text" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </CardActions>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <Button variant="text" onClick={() => setEditing(true)} disabled={isPending}>
            {item.configured ? "Replace" : "Set value"}
          </Button>
          {item.source === "app" && (
            <Button
              variant="text"
              onClick={remove}
              disabled={isPending}
              style={{ color: "var(--md-color-error, #b00)" }}
            >
              Delete
            </Button>
          )}
          {feedback && (
            <span style={{ fontSize: 12, opacity: 0.7, alignSelf: "center" }}>{feedback}</span>
          )}
        </div>
      )}
    </div>
  );
}
