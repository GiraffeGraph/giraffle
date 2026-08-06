"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AppUpdateStatus } from "@/domain/update/update.types";
import styles from "@/components/settings/SettingsWorkspace.module.css";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function getReleasePreview(notes: string | null) {
  if (!notes) return null;
  const normalized = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        Boolean(line) &&
        !line.replaceAll("*", "").toLowerCase().startsWith("full changelog") &&
        !line.startsWith("http://") &&
        !line.startsWith("https://"),
    )
    .slice(0, 4)
    .join("\n");
  return normalized || null;
}

export function UpdateCenterCard({ status }: { status: AppUpdateStatus }) {
  const [copied, setCopied] = useState(false);
  const releasePreview = useMemo(
    () => getReleasePreview(status.releaseNotes),
    [status.releaseNotes],
  );
  const checkedAt = formatDate(status.checkedAt);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(status.updateCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className={styles.contentSection} id="updates">
      <div
        className={`${styles.statusBlock} ${status.updateAvailable ? styles.statusBlockActive : ""}`}
      >
        <div className={styles.statusHeading}>
          <strong>
            {status.updateAvailable
              ? "A new version is available"
              : "Giraffle is up to date"}
          </strong>
          <span>v{status.currentVersion}</span>
        </div>
        <p className={styles.statusBody}>
          {status.updateAvailable
            ? "You can review what changed before updating."
            : "You are using the latest available version."}
        </p>
        {checkedAt ? (
          <div className={styles.statusMeta}>
            <span>Last checked {checkedAt}</span>
          </div>
        ) : null}
      </div>

      {releasePreview ? (
        <div className={styles.detailBlock}>
          <h4>What&apos;s new</h4>
          <pre>{releasePreview}</pre>
        </div>
      ) : null}

      {status.error ? (
        <p className={styles.error}>
          We couldn&apos;t check for updates right now. Try again later.
        </p>
      ) : null}

      {status.releaseUrl ? (
        <div className={styles.actions}>
          <a href={status.releaseUrl} target="_blank" rel="noreferrer">
            See what&apos;s new
          </a>
        </div>
      ) : null}

      <details className={styles.advancedBlock}>
        <summary>Update this installation</summary>
        <p>Copy this line and run it where Giraffle is installed.</p>
        <pre className={styles.codeBlock}>{status.updateCommand}</pre>
        <div className={styles.actions}>
          <Button type="button" variant="text" onClick={() => void copyCommand()}>
            {copied ? "Copied" : "Copy update line"}
          </Button>
        </div>
      </details>
    </section>
  );
}
