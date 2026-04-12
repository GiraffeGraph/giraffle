"use client";

import { useState } from "react";
import {
  LOCAL_SYNC_QUEUE_STORAGE_KEY,
  type LocalSyncQueueItem,
} from "@/lib/workspace-preferences";
import { FeedSettingsPanel } from "@/components/feeds/FeedSettingsPanel";
import { UpdateCenterCard } from "@/components/update/UpdateCenterCard";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent, CardActions } from "@/components/ui/Card";
import type { WorkspaceFeedSummary } from "@/domain/feed/feed.types";
import type { AppUpdateStatus } from "@/domain/update/update.types";

export interface SettingsWorkspaceProps {
  updateStatus?: AppUpdateStatus;
  feeds?: WorkspaceFeedSummary[];
  notes?: Array<{ id: string; title: string }>;
  folders?: Array<{ id: string; name: string }>;
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
  embedded?: boolean;
  showHeading?: boolean;
}

export function SettingsWorkspace({
  updateStatus,
  feeds = [],
  notes = [],
  folders = [],
  operationLogs,
  embedded = false,
  showHeading = true,
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

  const containerStyle = embedded
    ? {
        padding: "20px",
        maxWidth: "none",
        margin: 0,
        display: "flex",
        flexDirection: "column" as const,
        gap: "20px",
      }
    : {
        padding: "32px",
        maxWidth: "1040px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column" as const,
        gap: "24px",
      };

  return (
    <div style={containerStyle}>
      {showHeading ? (
        <h1
          className="md-typescale-display-small"
          style={{
            marginBottom: "16px",
            color: "var(--md-sys-color-on-background)",
          }}
        >
          Sistem Ayarları
        </h1>
      ) : null}

      {updateStatus ? <UpdateCenterCard status={updateStatus} /> : null}

      {feeds.length > 0 || notes.length > 0 || folders.length > 0 ? (
        <Card variant="outlined">
          <CardHeader>
            <CardTitle>Akış Yönetimi</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedSettingsPanel feeds={feeds} notes={notes} folders={folders} />
          </CardContent>
        </Card>
      ) : null}

      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Yerel Eşitleme Sınırı</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
            <div style={{ padding: "16px", borderRadius: "12px", background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)", flex: 1 }}>
              <div style={{ fontSize: "var(--md-sys-typescale-label-medium-size)" }}>Kuyruktaki İşlem</div>
              <div style={{ fontSize: "var(--md-sys-typescale-display-small-size)", fontWeight: "bold" }}>{queuedItems.length}</div>
            </div>
          </div>

          <div style={{ border: "1px solid var(--md-sys-color-outline-variant)", borderRadius: "var(--md-sys-shape-medium)", overflow: "hidden" }}>
            <ul className="md-list" style={{ padding: 0 }}>
              {queuedItems.length === 0 ? (
                <li className="md-list-item">
                  <div className="md-list-item-content">
                    <span className="md-list-item-headline" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>Bekleyen yerel işlem yok.</span>
                  </div>
                </li>
              ) : (
                queuedItems.map((item, index) => (
                  <li key={item.id} className="md-list-item" style={{ borderBottom: index < queuedItems.length - 1 ? "1px solid var(--md-sys-color-outline-variant)" : "none" }}>
                    <div className="md-list-item-content">
                      <span className="md-list-item-headline">{item.entityType}:{item.actionType}</span>
                      <span className="md-list-item-supporting-text">{item.entityId} · {new Date(item.queuedAt).toLocaleString("tr-TR")}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </CardContent>
        <CardActions>
          <Button
            variant="filled"
            onClick={clearQueue}
            disabled={queuedItems.length === 0}
          >
            Yerel kuyruğu temizle
          </Button>
        </CardActions>
      </Card>

      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Sunucu Operasyonları</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ border: "1px solid var(--md-sys-color-outline-variant)", borderRadius: "var(--md-sys-shape-medium)", overflow: "hidden" }}>
            <ul className="md-list" style={{ padding: 0 }}>
              {operationLogs.length === 0 ? (
                <li className="md-list-item">
                  <div className="md-list-item-content">
                    <span className="md-list-item-headline" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>Henüz işlem kaydı yok.</span>
                  </div>
                </li>
              ) : (
                operationLogs.map((entry, index) => (
                  <li key={entry.id} className="md-list-item" style={{ borderBottom: index < operationLogs.length - 1 ? "1px solid var(--md-sys-color-outline-variant)" : "none" }}>
                    <div className="md-list-item-content">
                      <span className="md-list-item-headline">{entry.entityType}:{entry.actionType}</span>
                      <span className="md-list-item-supporting-text">{entry.entityId} · {new Date(entry.createdAt).toLocaleString("tr-TR")}</span>
                    </div>
                    <div className="md-list-item-end" style={{ fontSize: "var(--md-sys-typescale-label-small-size)", color: "var(--md-sys-color-primary)", padding: "4px 8px", background: "var(--md-sys-color-primary-container)", borderRadius: "12px" }}>
                      {entry.source}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
