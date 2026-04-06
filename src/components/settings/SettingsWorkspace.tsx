"use client";

import { useState } from "react";
import {
  LOCAL_SYNC_QUEUE_STORAGE_KEY,
  type LocalSyncQueueItem,
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

  const clearQueue = () => {
    window.localStorage.removeItem(LOCAL_SYNC_QUEUE_STORAGE_KEY);
    setQueuedItems([]);
  };

  return (
    <div className="settings-layout">
      <section className="settings-panel">
        <div className="dashboard-section-head">
          <span className="dashboard-section-kicker">Yerel eşitleme sınırı</span>
        </div>
        <div className="settings-stat-grid">
          <div className="settings-stat-card">
            <span className="settings-stat-label">Kuyruktaki işlem</span>
            <strong>{queuedItems.length}</strong>
          </div>
        </div>
        <div className="settings-log-list">
          {queuedItems.length === 0 ? (
            <div className="settings-empty">Bekleyen yerel işlem yok.</div>
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
          Yerel kuyruğu temizle
        </button>
      </section>

      <section className="settings-panel">
        <div className="dashboard-section-head">
          <span className="dashboard-section-kicker">Sunucu operasyonları</span>
        </div>
        <div className="settings-log-list">
          {operationLogs.length === 0 ? (
            <div className="settings-empty">Henüz işlem kaydı yok.</div>
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
