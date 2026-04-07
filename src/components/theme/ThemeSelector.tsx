"use client";

import { useEffect, useState } from "react";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  type AppThemeId,
  isAppThemeId,
  persistAppTheme,
} from "./theme-config";

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState<AppThemeId>(DEFAULT_APP_THEME);

  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (stored && isAppThemeId(stored)) {
      setActiveThemeId(stored);
    } else {
      const current = document.documentElement.dataset.theme;
      if (current && isAppThemeId(current)) {
        setActiveThemeId(current);
      }
    }

    // Listen for theme changes from other components (like Sidebar reset)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "data-theme") {
          const newTheme = document.documentElement.dataset.theme;
          if (newTheme && isAppThemeId(newTheme)) {
            setActiveThemeId(newTheme);
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  if (!mounted) return null;

  const applyTheme = (id: AppThemeId) => {
    persistAppTheme(id);
    setActiveThemeId(id);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "18px",
        right: "18px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px",
        background: "var(--surface-glass)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--border-soft)",
        borderRadius: "99px",
        boxShadow: "var(--shadow-panel)",
        zIndex: 50,
      }}
    >
      <button
        onClick={() => applyTheme("warm-paper")}
        title="Sıcak Kağıt (Aydınlık)"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: activeThemeId === "warm-paper" ? "var(--surface-highlight)" : "transparent",
          border: activeThemeId === "warm-paper" ? "1px solid var(--border-strong)" : "1px solid transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          color: "var(--text-primary)",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = activeThemeId === "warm-paper" ? "var(--surface-highlight)" : "transparent")}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
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
      </button>

      <button
        onClick={() => applyTheme("midnight-gold")}
        title="Gece Altını (Giraffe)"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: activeThemeId === "midnight-gold" ? "var(--surface-highlight)" : "transparent",
          border: activeThemeId === "midnight-gold" ? "1px solid var(--border-strong)" : "1px solid transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          fontSize: "20px",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = activeThemeId === "midnight-gold" ? "var(--surface-highlight)" : "transparent")}
      >
        🦒
      </button>

      <button
        onClick={() => applyTheme("graphite-night")}
        title="Grafit Gece (Karanlık)"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: activeThemeId === "graphite-night" ? "var(--surface-highlight)" : "transparent",
          border: activeThemeId === "graphite-night" ? "1px solid var(--border-strong)" : "1px solid transparent",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          color: "var(--text-primary)",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = activeThemeId === "graphite-night" ? "var(--surface-highlight)" : "transparent")}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
    </div>
  );
}
