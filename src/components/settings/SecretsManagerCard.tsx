"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import type { AppSettingKey } from "@/domain/app-settings/app-settings.types";
import {
  deleteAppSettingAction,
  setAppSettingAction,
} from "@/server/api/app-settings";
import styles from "./SettingsWorkspace.module.css";

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
      return "Saved here";
    case "env":
      return "System setting";
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
  return (
    <div className={styles.standaloneRoot}>
      <header className={styles.sectionIntro}>
        <h1 className={styles.title}>More settings</h1>
        <p className={styles.sectionDescription}>
          Extra choices for this installation.
        </p>
      </header>

      {!encryptionAvailable ? (
        <section className={styles.contentSection}>
          <p className={styles.error}>
            These settings cannot be saved safely yet.
          </p>
        </section>
      ) : (
        <section className={styles.contentSection}>
          <div className={styles.contentSectionHeader}>
            <div>
              <h3>Optional settings</h3>
              <p>
                Saved values are kept private. Leave anything you do not
                recognize unchanged.
              </p>
              <details className={styles.advancedBlock}>
                <summary>About these settings</summary>
                <p>
                  Most people do not need to change these. Some are chosen when
                  Giraffle is installed and can only be changed there.
                </p>
              </details>
            </div>
          </div>
          <div className={styles.secretList}>
            {items.map((item) => (
              <SecretRow key={item.key} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
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
      } catch (nextError) {
        console.error("Advanced setting save failed", nextError);
        setError("We couldn't save this setting. Please try again.");
      }
    });
  };

  const remove = async () => {
    const confirmed = await confirmDialog({
      title: "Remove setting?",
      message: `Remove the saved value for ${item.key}?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setError(null);
        await deleteAppSettingAction(item.key);
        setFeedback("Removed");
        router.refresh();
      } catch (nextError) {
        console.error("Advanced setting removal failed", nextError);
        setError("We couldn't remove this setting. Please try again.");
      }
    });
  };

  return (
    <article className={styles.secretRow}>
      <div className={styles.secretRowHeader}>
        <div>
          <code>{item.key}</code>
          <div className={styles.secretDescription}>{item.description}</div>
        </div>
        <span className={styles.secretSource}>{sourceLabel(item.source)}</span>
      </div>

      <div className={styles.secretMeta}>
        {item.configured
          ? `Current ${item.preview ?? "•••"} · updated ${formatDate(item.updatedAt)}`
          : "Not configured"}
      </div>

      {editing ? (
        <div className={styles.secretEditor}>
          <label className={styles.field}>
            <span>New value</span>
            <input
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={`Value for ${item.key}`}
              disabled={isPending}
              autoFocus
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <Button variant="text" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button
            variant="text"
            onClick={() => setEditing(true)}
            disabled={isPending}
          >
            {item.configured ? "Replace" : "Set value"}
          </Button>
          {item.source === "app" ? (
            <Button
              variant="text"
              onClick={remove}
              disabled={isPending}
              className={styles.error}
            >
              Remove
            </Button>
          ) : null}
          {feedback ? <span className={styles.feedback}>{feedback}</span> : null}
        </div>
      )}
    </article>
  );
}
