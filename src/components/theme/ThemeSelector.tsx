"use client";

import Image from "next/image";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import {
  APP_THEMES,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  type AppThemeId,
  isAppThemeId,
  persistAppTheme,
} from "./theme-config";

function getThemeSnapshot(): AppThemeId {
  if (typeof window === "undefined") {
    return DEFAULT_APP_THEME;
  }

  const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);

  if (stored && isAppThemeId(stored)) {
    return stored;
  }

  const current = document.documentElement.dataset.theme;
  return current && isAppThemeId(current) ? current : DEFAULT_APP_THEME;
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = () => onStoreChange();
  const observer = new MutationObserver(() => onStoreChange());

  window.addEventListener("storage", handleStorage);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => {
    window.removeEventListener("storage", handleStorage);
    observer.disconnect();
  };
}

export function ThemeSelector({
  vertical = false,
  mobileInline = false,
}: {
  vertical?: boolean;
  mobileInline?: boolean;
}) {
  const activeThemeId = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    () => DEFAULT_APP_THEME
  );
  const isMobileViewport = useIsMobileViewport(900);

  const applyTheme = (id: AppThemeId) => {
    persistAppTheme(id);
  };

  const nextTheme = useMemo(() => {
    const currentIndex = APP_THEMES.findIndex(
      (theme) => theme.id === activeThemeId
    );
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % APP_THEMES.length;

    return APP_THEMES[nextIndex] ?? APP_THEMES[0];
  }, [activeThemeId]);

  const renderThemeIcon = (themeId: AppThemeId) => {
    if (themeId === "warm-paper") {
      return (
        <svg
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    }

    if (themeId === "midnight-gold") {
      return (
        <Image
          src="/apple-icon.png"
          alt="Midnight Gold"
          width={20}
          height={20}
          style={{ borderRadius: "4px" }}
        />
      );
    }

    return (
      <svg
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  };

  if (isMobileViewport && !vertical) {
    return (
      <div
        style={{
          ...(mobileInline
            ? {}
            : {
                position: "fixed",
                top: "max(12px, env(safe-area-inset-top, 0px))",
                right: "12px",
                zIndex: 55,
              }),
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: mobileInline ? "0" : "6px",
          border: mobileInline
            ? "none"
            : "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: mobileInline ? "0" : "999px",
          background: mobileInline
            ? "transparent"
            : "var(--md-sys-color-surface-container-high)",
          boxShadow: mobileInline ? "none" : "var(--md-sys-elevation-level2)",
          backdropFilter: mobileInline ? "none" : "blur(12px)",
        }}
      >
        <Button
          icon
          variant="tonal"
          onClick={() => applyTheme(nextTheme.id)}
          title={`Switch theme · Next: ${nextTheme.label}`}
          aria-label={`Switch theme. Next theme: ${nextTheme.label}`}
          style={
            mobileInline
              ? {
                  width: "32px",
                  height: "32px",
                  minWidth: "32px",
                  borderRadius: "10px",
                }
              : undefined
          }
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transform: mobileInline ? "scale(0.85)" : "none",
            }}
          >
            {renderThemeIcon(activeThemeId)}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        ...(vertical
          ? {}
          : {
              position: "fixed",
              top: "18px",
              right: "18px",
              border: "1px solid var(--md-sys-color-outline-variant)",
              borderRadius: "var(--md-sys-shape-full)",
              boxShadow: "var(--md-sys-elevation-level2)",
              zIndex: 50,
            }),
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        gap: "4px",
        padding: "6px",
        background: vertical
          ? "transparent"
          : "var(--md-sys-color-surface-container-high)",
        backdropFilter: vertical ? "none" : "blur(12px)",
      }}
    >
      <Button
        icon
        variant={activeThemeId === "warm-paper" ? "tonal" : "text"}
        onClick={() => applyTheme("warm-paper")}
        title="Warm Paper (Light)"
      >
        <svg
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      </Button>

      <Button
        icon
        variant={activeThemeId === "midnight-gold" ? "tonal" : "text"}
        onClick={() => applyTheme("midnight-gold")}
        title="Midnight Gold (Giraffe)"
      >
        <Image
          src="/apple-icon.png"
          alt="Midnight Gold"
          width={20}
          height={20}
          style={{ borderRadius: "4px" }}
        />
      </Button>

      <Button
        icon
        variant={activeThemeId === "graphite-night" ? "tonal" : "text"}
        onClick={() => applyTheme("graphite-night")}
        title="Graphite Night (Dark)"
      >
        <svg
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </Button>
    </div>
  );
}
