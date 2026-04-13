"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AppUpdateStatus } from "@/domain/update/update.types";

const DISMISSED_UPDATE_STORAGE_KEY = "giraffle.dismissed-update-version";

export function UpdateBanner({
  status,
}: {
  status: AppUpdateStatus;
}) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      return window.localStorage.getItem(DISMISSED_UPDATE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const hidden = useMemo(() => {
    return !status.updateAvailable || !status.latestVersion || dismissedVersion === status.latestVersion;
  }, [dismissedVersion, status.latestVersion, status.updateAvailable]);

  if (hidden) {
    return null;
  }

  return (
    <section
      style={{
        display: "grid",
        gap: "12px",
        padding: "18px 20px",
        borderRadius: "20px",
        border: "1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--md-sys-color-primary-container) 88%, transparent), color-mix(in srgb, var(--md-sys-color-surface-container-highest) 92%, transparent))",
        boxShadow: "var(--md-sys-elevation-level1)",
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--md-sys-color-primary)",
          }}
        >
          Update available
        </div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
          Giraffle {status.latestVersion} has been released
        </div>
        <div style={{ fontSize: "14px", color: "var(--md-sys-color-on-surface-variant)" }}>
          You are currently on {status.currentVersion}. Open settings for details and update commands.
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Link href="/settings#updates" className="dashboard-empty-btn">
          Open update
        </Link>
        <Button
          type="button"
          variant="text"
          onClick={() => {
            if (!status.latestVersion) {
              return;
            }

            try {
              window.localStorage.setItem(DISMISSED_UPDATE_STORAGE_KEY, status.latestVersion);
            } catch {
              // ignore localStorage errors
            }

            setDismissedVersion(status.latestVersion);
          }}
        >
          Later
        </Button>
      </div>
    </section>
  );
}
