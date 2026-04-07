"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  type AppThemeId,
  isAppThemeId,
  persistAppTheme,
} from "./theme-config";
import iconImg from "@/app/icon1.png";

import { Button } from "@/components/ui/Button";

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
        background: "var(--md-sys-color-surface-container-high)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--md-sys-color-outline-variant)",
        borderRadius: "var(--md-sys-shape-full)",
        boxShadow: "var(--md-sys-elevation-level2)",
        zIndex: 50,
      }}
    >
      <Button
        icon
        variant={activeThemeId === "warm-paper" ? "tonal" : "text"}
        onClick={() => applyTheme("warm-paper")}
        title="Sıcak Kağıt (Aydınlık)"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
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
        title="Gece Altını (Giraffe)"
      >
        <Image src={iconImg} alt="Giraffe Logo" width={20} height={20} style={{ borderRadius: "4px", opacity: activeThemeId === "midnight-gold" ? 1 : 0.8 }} />
      </Button>

      <Button
        icon
        variant={activeThemeId === "graphite-night" ? "tonal" : "text"}
        onClick={() => applyTheme("graphite-night")}
        title="Grafit Gece (Karanlık)"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </Button>
    </div>
  );
}
