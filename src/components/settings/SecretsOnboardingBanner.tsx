"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "giraffle.secrets-onboarding-dismissed";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

const getSnapshot = () => localStorage.getItem(STORAGE_KEY) === "1";
const getServerSnapshot = () => false;

export function SecretsOnboardingBanner() {
  const persistedHidden = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [localHidden, setLocalHidden] = useState(false);

  if (persistedHidden || localHidden) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setLocalHidden(true);
  };

  return (
    <div
      role="status"
      style={{
        background: "var(--md-color-warning-container, #fff4d4)",
        color: "var(--md-color-on-warning-container, #4a3300)",
        borderBottom: "1px solid var(--md-color-outline-variant, #ddd)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>
        OpenAI / OAuth keys still in <code>.env</code>? Move them to{" "}
        <Link
          href="/settings/secrets"
          style={{ textDecoration: "underline", fontWeight: 600 }}
        >
          /settings/secrets
        </Link>{" "}
        to manage them in-app and drop your env file.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          border: 0,
          background: "transparent",
          color: "inherit",
          fontSize: 16,
          cursor: "pointer",
          padding: 4,
        }}
      >
        ×
      </button>
    </div>
  );
}
