"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

interface MainErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const CHUNK_ERROR_PATTERNS = [
  "chunkloaderror",
  "loading chunk",
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "dynamically imported module",
  "page could not be loaded",
  "page couldn't be loaded",
];

function isRecoverableClientLoadError(error: Error | null): boolean {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.name ?? ""}`.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export default function MainError({ error, reset }: MainErrorProps) {
  const router = useRouter();
  const [isReloading, setIsReloading] = useState(false);
  const recoverable = useMemo(
    () => isRecoverableClientLoadError(error),
    [error],
  );

  useEffect(() => {
    if (!recoverable || typeof window === "undefined") return;

    const path = window.location.pathname;
    const markerKey = "giraffle:last-recoverable-load-error";
    const markerValue = `${path}::${(error.message ?? "").slice(0, 160)}`;

    if (window.sessionStorage.getItem(markerKey) === markerValue) {
      return;
    }

    window.sessionStorage.setItem(markerKey, markerValue);
    setIsReloading(true);

    const timer = window.setTimeout(() => {
      window.location.reload();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [error.message, recoverable]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--md-sys-color-surface)",
        color: "var(--md-sys-color-on-surface)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: 16,
          background: "var(--md-sys-color-surface-container)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.25 }}>
          This page couldn&apos;t load
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--md-sys-color-on-surface-variant)",
            fontSize: 14,
          }}
        >
          {isReloading
            ? "Refreshing with the latest app bundle..."
            : "Reload to try again, or go back."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            style={buttonStyle}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ ...buttonStyle, background: "transparent" }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={reset}
            style={{ ...buttonStyle, background: "transparent" }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--md-sys-color-outline)",
  borderRadius: 999,
  background: "var(--md-sys-color-primary)",
  color: "var(--md-sys-color-on-primary)",
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
