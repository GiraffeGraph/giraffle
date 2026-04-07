"use client";

import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

interface TopbarPathNavigatorProps {
  currentPath: string;
}

function normalizeInternalPath(rawValue: string) {
  const trimmedValue = rawValue.trim();

  if (!trimmedValue || trimmedValue.startsWith("//")) {
    return null;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(trimmedValue)) {
    try {
      const currentOrigin = window.location.origin;
      const url = new URL(trimmedValue);

      if (url.origin !== currentOrigin) {
        return null;
      }

      return `${url.pathname}${url.search}${url.hash}` || "/";
    } catch {
      return null;
    }
  }

  try {
    const normalizedValue = trimmedValue.startsWith("/")
      ? trimmedValue
      : `/${trimmedValue}`;
    const url = new URL(normalizedValue, window.location.origin);

    if (url.origin !== window.location.origin) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return null;
  }
}

export function TopbarPathNavigator({ currentPath }: TopbarPathNavigatorProps) {
  const router = useRouter();
  const [draftPath, setDraftPath] = useState(currentPath);
  const [hasError, setHasError] = useState(false);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextPath = normalizeInternalPath(draftPath);

      if (!nextPath) {
        setHasError(true);
        return;
      }

      setHasError(false);
      setDraftPath(nextPath);

      if (nextPath === currentPath) {
        return;
      }

      router.push(nextPath);
    },
    [currentPath, draftPath, router]
  );

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        width: "100%",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          minWidth: 0,
          flex: 1,
          height: "28px",
          padding: "0 10px",
          borderRadius: "999px",
          border: `1px solid ${hasError ? "var(--md-sys-color-error)" : "var(--md-sys-color-outline-variant)"}`,
          background: hasError
            ? "color-mix(in srgb, var(--md-sys-color-error) 10%, var(--md-sys-color-surface-container-highest))"
            : "var(--md-sys-color-surface-container-highest)",
        }}
        title={hasError ? "Geçerli bir iç yol gir. Örn: /dashboard veya /notes/123" : "İç yol ile git"}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "15px", color: "var(--md-sys-color-on-surface-variant)", flexShrink: 0 }}
          aria-hidden="true"
        >
          route
        </span>
        <input
          value={draftPath}
          onChange={(event) => {
            setDraftPath(event.target.value);
            if (hasError) {
              setHasError(false);
            }
          }}
          aria-label="Gitmek istediğin iç yol"
          aria-invalid={hasError}
          spellCheck={false}
          placeholder="/dashboard"
          style={{
            width: "100%",
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--md-sys-color-on-surface)",
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace)",
          }}
        />
      </div>

      <button
        type="submit"
        aria-label="Yola git"
        title="Yola git"
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "999px",
          border: "1px solid var(--md-sys-color-outline-variant)",
          background: "var(--md-sys-color-surface-container-highest)",
          color: "var(--md-sys-color-on-surface-variant)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">
          arrow_forward
        </span>
      </button>
    </form>
  );
}
