"use client";

import { useMemo, useState } from "react";
import {
  APP_THEMES,
  DEFAULT_APP_THEME,
  type AppThemeId,
  isAppThemeId,
  APP_THEME_STORAGE_KEY,
  persistAppTheme,
} from "@/components/theme/theme-config";
import {
  DEFAULT_COLLAPSED_SECTIONS,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  LOCAL_SYNC_QUEUE_STORAGE_KEY,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_COMPACT_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  type LocalSyncQueueItem,
  type SidebarCollapseState,
} from "@/lib/workspace-preferences";

interface SettingsWorkspaceProps {
  operationLogs: Array<{
    id: string;
    entityType: string;
    entityId: string;
    actionType: string;
    payload: unknown;
    source: string;
    createdAt: string;
    appliedAt: string | null;
  }>;
}

export function SettingsWorkspace({
  operationLogs,
}: SettingsWorkspaceProps) {
  const [themeId, setThemeId] = useState<AppThemeId>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_APP_THEME;
    }

    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    return storedTheme && isAppThemeId(storedTheme)
      ? storedTheme
      : DEFAULT_APP_THEME;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
    }

    const storedWidth = Number.parseInt(
      window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? "",
      10
    );

    return Number.isFinite(storedWidth)
      ? storedWidth
      : DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  });
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_COMPACT_STORAGE_KEY) === "true";
  });
  const [sections, setSections] = useState<SidebarCollapseState>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_COLLAPSED_SECTIONS;
    }

    try {
      const storedSections = window.localStorage.getItem(
        SIDEBAR_COLLAPSE_STORAGE_KEY
      );

      if (!storedSections) {
        return DEFAULT_COLLAPSED_SECTIONS;
      }

      return {
        ...DEFAULT_COLLAPSED_SECTIONS,
        ...(JSON.parse(storedSections) as Partial<SidebarCollapseState>),
      };
    } catch {
      return DEFAULT_COLLAPSED_SECTIONS;
    }
  });
  const [queuedItems, setQueuedItems] = useState<LocalSyncQueueItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const storedQueue = window.localStorage.getItem(LOCAL_SYNC_QUEUE_STORAGE_KEY);
      return storedQueue ? (JSON.parse(storedQueue) as LocalSyncQueueItem[]) : [];
    } catch {
      return [];
    }
  });

  const appliedTheme = useMemo(
    () => APP_THEMES.find((theme) => theme.id === themeId) ?? APP_THEMES[0],
    [themeId]
  );

  const handleThemeChange = (nextThemeId: AppThemeId) => {
    setThemeId(nextThemeId);
    persistAppTheme(nextThemeId);
  };

  const resetPreferences = () => {
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_COMPACT_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_COLLAPSE_STORAGE_KEY);

    setThemeId(DEFAULT_APP_THEME);
    setSidebarWidth(DEFAULT_EXPANDED_SIDEBAR_WIDTH);
    setSidebarCompact(false);
    setSections(DEFAULT_COLLAPSED_SECTIONS);
    persistAppTheme(DEFAULT_APP_THEME);
  };

  const clearQueue = () => {
    window.localStorage.removeItem(LOCAL_SYNC_QUEUE_STORAGE_KEY);
    setQueuedItems([]);
  };

  return (
    <div className="settings-layout">
      <section className="settings-panel">
        <div className="dashboard-section-head">
          <span className="dashboard-section-kicker">Tema ve gorunum</span>
        </div>
        <label className="settings-field">
          <span>Aktif tema</span>
          <select
            value={themeId}
            onChange={(event) =>
              handleThemeChange(event.target.value as AppThemeId)
            }
          >
            {APP_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <div className="settings-helper-text">{appliedTheme.description}</div>
        <div className="settings-stat-grid">
          <div className="settings-stat-card">
            <span className="settings-stat-label">Sidebar genisligi</span>
            <strong>{sidebarWidth}px</strong>
          </div>
          <div className="settings-stat-card">
            <span className="settings-stat-label">Compact mod</span>
            <strong>{sidebarCompact ? "Acik" : "Kapali"}</strong>
          </div>
          <div className="settings-stat-card">
            <span className="settings-stat-label">Kapali bolumler</span>
            <strong>
              {Object.values(sections).filter(Boolean).length}/3
            </strong>
          </div>
        </div>
        <button
          type="button"
          className="dashboard-secondary-btn"
          onClick={resetPreferences}
        >
          UI tercihlerini sifirla
        </button>
      </section>

      <section className="settings-panel">
        <div className="dashboard-section-head">
          <span className="dashboard-section-kicker">Local sync siniri</span>
        </div>
        <div className="settings-stat-grid">
          <div className="settings-stat-card">
            <span className="settings-stat-label">Kuyruktaki mutation</span>
            <strong>{queuedItems.length}</strong>
          </div>
        </div>
        <div className="settings-log-list">
          {queuedItems.length === 0 ? (
            <div className="settings-empty">Bekleyen local mutation yok.</div>
          ) : (
            queuedItems.map((item) => (
              <div key={item.id} className="settings-log-row">
                <div>
                  <div className="settings-log-title">
                    {item.entityType}:{item.actionType}
                  </div>
                  <div className="settings-log-meta">
                    {item.entityId} · {new Date(item.queuedAt).toLocaleString("tr-TR")}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className="dashboard-secondary-btn"
          onClick={clearQueue}
          disabled={queuedItems.length === 0}
        >
          Local queue temizle
        </button>
      </section>

      <section className="settings-panel">
        <div className="dashboard-section-head">
          <span className="dashboard-section-kicker">Sunucu operasyonlari</span>
        </div>
        <div className="settings-log-list">
          {operationLogs.length === 0 ? (
            <div className="settings-empty">Henuz operation log yok.</div>
          ) : (
            operationLogs.map((entry) => (
              <div key={entry.id} className="settings-log-row">
                <div>
                  <div className="settings-log-title">
                    {entry.entityType}:{entry.actionType}
                  </div>
                  <div className="settings-log-meta">
                    {entry.entityId} · {new Date(entry.createdAt).toLocaleString("tr-TR")}
                  </div>
                </div>
                <span className="settings-log-source">{entry.source}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
