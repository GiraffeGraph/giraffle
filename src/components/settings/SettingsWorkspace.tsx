"use client";

import { useId, useState } from "react";
import {
  LOCAL_SYNC_QUEUE_STORAGE_KEY,
  type LocalSyncQueueItem,
} from "@/lib/workspace-preferences";
import { DesktopModeCard, useIsTauri } from "@/components/settings/DesktopModeCard";
import { IntegrationSettingsCard } from "@/components/settings/IntegrationSettingsCard";
import { McpAccessTokensCard, type McpAccessTokenView } from "@/components/settings/McpAccessTokensCard";
import { UpdateCenterCard } from "@/components/update/UpdateCenterCard";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent, CardActions } from "@/components/ui/Card";
import type { OpenAiIntegrationSummary } from "@/domain/integration/integration.types";
import type { AppUpdateStatus } from "@/domain/update/update.types";
import styles from "./SettingsWorkspace.module.css";

export interface SettingsWorkspaceProps {
  appVersion: string;
  updateStatus?: AppUpdateStatus;
  openaiIntegration: Omit<OpenAiIntegrationSummary, "updatedAt"> & {
    updatedAt: string | null;
  };
  encryptionAvailable: boolean;
  mcpAccessTokens: McpAccessTokenView[];
  operationLogs: OperationLogView[];
  embedded?: boolean;
  showHeading?: boolean;
}

type OperationLogView = {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  payload: unknown;
  source: string;
  createdAt: string;
  appliedAt: string | null;
};

type SettingsTabId = "hosting" | "desktop" | "integrations" | "access" | "sync";

type SettingsTab = {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: string;
  badge: string;
};

export function SettingsWorkspace({
  appVersion,
  updateStatus,
  openaiIntegration,
  encryptionAvailable,
  mcpAccessTokens,
  operationLogs,
  embedded = false,
  showHeading = true,
}: SettingsWorkspaceProps) {
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTabId>("hosting");
  const isTauri = useIsTauri();
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

  const tabs: SettingsTab[] = [
    {
      id: "hosting",
      label: "Updates",
      description: "Version and release flow",
      icon: "deployed_code",
      badge: updateStatus?.updateAvailable ? "Update" : `v${appVersion}`,
    },
    ...(isTauri
      ? ([
          {
            id: "desktop",
            label: "Desktop",
            description: "Local / external / remote mode",
            icon: "desktop_windows",
            badge: "App",
          },
        ] as SettingsTab[])
      : []),
    {
      id: "integrations",
      label: "AI Provider",
      description: "OpenAI key and base URL",
      icon: "hub",
      badge: openaiIntegration.apiKeySource,
    },
    {
      id: "access",
      label: "MCP Access",
      description: "External agent tokens",
      icon: "key",
      badge: String(mcpAccessTokens.length),
    },
    {
      id: "sync",
      label: "Sync & Logs",
      description: "Local queue and server audit",
      icon: "sync_alt",
      badge: `${queuedItems.length} pending`,
    },
  ];

  return (
    <div className={`${styles.root} ${embedded ? styles.rootEmbedded : ""}`}>
      {showHeading ? (
        <SettingsHero
          appVersion={appVersion}
          apiKeySource={openaiIntegration.apiKeySource}
          tokenCount={mcpAccessTokens.length}
        />
      ) : null}

      <div className={styles.shell}>
        <aside className={styles.tabRail} aria-label="Settings sections">
          <div className={styles.tabList} role="tablist" aria-orientation="vertical">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`${tabsId}-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`${tabsId}-${tab.id}-panel`}
                className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>
                <span className={styles.tabCopy}>
                  <span className={styles.tabLabel}>{tab.label}</span>
                  <span className={styles.tabDescription}>{tab.description}</span>
                </span>
                <span className={styles.badge}>{tab.badge}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.content}>
          <section
            id={`${tabsId}-hosting-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-hosting-tab`}
            hidden={activeTab !== "hosting"}
            className={styles.panel}
          >
            <SettingsSectionIntro title="Updates" />
            {updateStatus ? <UpdateCenterCard status={updateStatus} /> : null}
          </section>

          {isTauri ? (
            <section
              id={`${tabsId}-desktop-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-desktop-tab`}
              hidden={activeTab !== "desktop"}
              className={styles.panel}
            >
              <SettingsSectionIntro title="Desktop" />
              <DesktopModeCard />
            </section>
          ) : null}

          <section
            id={`${tabsId}-integrations-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-integrations-tab`}
            hidden={activeTab !== "integrations"}
            className={styles.panel}
          >
            <SettingsSectionIntro title="AI Provider" />
            <IntegrationSettingsCard
              openai={openaiIntegration}
              encryptionAvailable={encryptionAvailable}
            />
          </section>

          <section
            id={`${tabsId}-access-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-access-tab`}
            hidden={activeTab !== "access"}
            className={styles.panel}
          >
            <SettingsSectionIntro title="MCP Access" />
            <McpAccessTokensCard tokens={mcpAccessTokens} />
          </section>

          <section
            id={`${tabsId}-sync-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-sync-tab`}
            hidden={activeTab !== "sync"}
            className={styles.panel}
          >
            <SettingsSectionIntro title="Sync & Logs" />
            <div className={styles.statGrid}>
              <SettingsStat label="Queued operations" value={queuedItems.length} caption="Local browser queue" />
              <SettingsStat label="Server logs" value={operationLogs.length} caption="Latest loaded entries" />
              <SettingsStat label="Sources" value={new Set(operationLogs.map((entry) => entry.source)).size} caption="Distinct operation origins" />
            </div>
            <LocalSyncQueueCard queuedItems={queuedItems} onClearQueue={clearQueue} />
            <ServerOperationsCard operationLogs={operationLogs} />
          </section>
        </main>
      </div>
    </div>
  );
}

function SettingsHero({
  appVersion,
  apiKeySource,
  tokenCount,
}: {
  appVersion: string;
  apiKeySource: string;
  tokenCount: number;
}) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.kicker}>Giraffle Control Room</p>
        <h1 className={styles.title}>Settings</h1>
      </div>
      <div className={styles.heroMeta} aria-label="Settings summary">
        <SummaryMeta label="Version" value={`v${appVersion}`} />
        <SummaryMeta label="OpenAI key" value={apiKeySource} />
        <SummaryMeta label="MCP tokens" value={String(tokenCount)} />
      </div>
    </header>
  );
}

function SummaryMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaCard}>
      <span>{label}</span>
      <span className={styles.metaValue}>{value}</span>
    </div>
  );
}

function SettingsSectionIntro({ title }: { title: string }) {
  return (
    <div className={styles.sectionIntro}>
      <h2 className={styles.sectionTitle}>{title}</h2>
    </div>
  );
}

function SettingsStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statCaption}>{caption}</div>
    </div>
  );
}

function LocalSyncQueueCard({
  queuedItems,
  onClearQueue,
}: {
  queuedItems: LocalSyncQueueItem[];
  onClearQueue: () => void;
}) {
  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Local Sync Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={styles.cardNotice}>
          <div className={styles.noticeLabel}>Queued operations</div>
          <div className={styles.noticeValue}>{queuedItems.length}</div>
        </div>

        <div className={styles.compactList} style={{ marginTop: "18px" }}>
          <ul className="md-list" style={{ padding: 0 }}>
            {queuedItems.length === 0 ? (
              <li className="md-list-item">
                <div className="md-list-item-content">
                  <span className="md-list-item-headline" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>No pending local operations.</span>
                </div>
              </li>
            ) : (
              queuedItems.map((item, index) => (
                <li key={item.id} className="md-list-item" style={{ borderBottom: index < queuedItems.length - 1 ? "1px solid var(--md-sys-color-outline-variant)" : "none" }}>
                  <div className="md-list-item-content">
                    <span className="md-list-item-headline">{item.entityType}:{item.actionType}</span>
                    <span className="md-list-item-supporting-text">{item.entityId} · {new Date(item.queuedAt).toLocaleString("en-US")}</span>
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
          onClick={onClearQueue}
          disabled={queuedItems.length === 0}
        >
          Clear local queue
        </Button>
      </CardActions>
    </Card>
  );
}

function ServerOperationsCard({ operationLogs }: { operationLogs: OperationLogView[] }) {
  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Server Operations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={styles.compactList}>
          <ul className="md-list" style={{ padding: 0 }}>
            {operationLogs.length === 0 ? (
              <li className="md-list-item">
                <div className="md-list-item-content">
                  <span className="md-list-item-headline" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>No operation logs yet.</span>
                </div>
              </li>
            ) : (
              operationLogs.map((entry, index) => (
                <li key={entry.id} className="md-list-item" style={{ borderBottom: index < operationLogs.length - 1 ? "1px solid var(--md-sys-color-outline-variant)" : "none" }}>
                  <div className="md-list-item-content">
                    <span className="md-list-item-headline">{entry.entityType}:{entry.actionType}</span>
                    <span className="md-list-item-supporting-text">{entry.entityId} · {new Date(entry.createdAt).toLocaleString("en-US")}</span>
                  </div>
                  <div className="md-list-item-end">
                    <span className={styles.operationSource}>{entry.source}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
