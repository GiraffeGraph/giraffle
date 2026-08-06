"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { LocalSyncQueueItem } from "@/lib/workspace-preferences";
import {
  clearLocalSyncQueue,
  useLocalSyncQueue,
} from "@/lib/local-sync";
import {
  McpAccessTokensCard,
  type McpAccessTokenView,
} from "@/components/settings/McpAccessTokensCard";
import { UpdateCenterCard } from "@/components/update/UpdateCenterCard";
import { Button } from "@/components/ui/Button";
import type { AppUpdateStatus } from "@/domain/update/update.types";
import styles from "./SettingsWorkspace.module.css";

export interface SettingsWorkspaceProps {
  appVersion: string;
  updateStatus?: AppUpdateStatus;
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

type SettingsTabId = "updates" | "connections" | "activity";

type SettingsTab = {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: string;
  meta: string;
};

const ITEM_LABELS: Record<string, string> = {
  note: "Page",
  folder: "Folder",
  board: "Board",
  canvas: "Canvas",
  task: "Task",
};

const ACTION_LABELS: Record<string, string> = {
  create: "created",
  update: "updated",
  "save-content": "edited",
  archive: "archived",
  restore: "restored",
  delete: "deleted",
  relocate: "moved",
  "move-up": "moved",
  "move-down": "moved",
};

function describeChange(entityType: string, actionType: string) {
  const item = ITEM_LABELS[entityType.toLowerCase()] ?? "Item";
  const action = ACTION_LABELS[actionType.toLowerCase()] ?? "changed";
  return `${item} ${action}`;
}

export function SettingsWorkspace({
  appVersion,
  updateStatus,
  mcpAccessTokens,
  operationLogs,
  embedded = false,
  showHeading = true,
}: SettingsWorkspaceProps) {
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTabId>("updates");
  const queuedItems = useLocalSyncQueue();

  const tabs: SettingsTab[] = [
    {
      id: "updates",
      label: "Updates",
      description: "Keep Giraffle current",
      icon: "deployed_code",
      meta: updateStatus?.updateAvailable ? "Available" : `v${appVersion}`,
    },
    {
      id: "connections",
      label: "Connected apps",
      description: "Apps you have connected",
      icon: "key",
      meta:
        mcpAccessTokens.length === 0
          ? "None"
          : `${mcpAccessTokens.length} connected`,
    },
    {
      id: "activity",
      label: "Activity",
      description: "Saving progress and recent changes",
      icon: "sync_alt",
      meta: queuedItems.length === 0 ? "All saved" : `${queuedItems.length} waiting`,
    },
  ];

  return (
    <div className={`${styles.root} ${embedded ? styles.rootEmbedded : ""}`}>
      {showHeading ? (
        <SettingsHeader
          appVersion={appVersion}
          connectionCount={mcpAccessTokens.length}
        />
      ) : null}

      <div className={styles.shell}>
        <aside className={styles.tabRail} aria-label="Settings sections">
          <div
            className={styles.tabList}
            role="tablist"
            aria-orientation="vertical"
          >
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
                <span className={styles.tabIcon} aria-hidden="true">
                  {tab.icon}
                </span>
                <span className={styles.tabCopy}>
                  <span className={styles.tabLabel}>{tab.label}</span>
                  <span className={styles.tabDescription}>
                    {tab.description}
                  </span>
                </span>
                <span className={styles.tabMeta}>{tab.meta}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.content}>
          <section
            id={`${tabsId}-updates-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-updates-tab`}
            hidden={activeTab !== "updates"}
            className={styles.panel}
          >
            <SettingsSectionIntro
              title="Updates"
              description="See your current version and check for a newer one."
            />
            {updateStatus ? <UpdateCenterCard status={updateStatus} /> : null}
            <div className={styles.actions}>
              <Link href="/settings/secrets">More settings</Link>
            </div>
          </section>

          <section
            id={`${tabsId}-connections-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-connections-tab`}
            hidden={activeTab !== "connections"}
            className={styles.panel}
          >
            <SettingsSectionIntro
              title="Connected apps"
              description="Choose which other apps can work with your Giraffle notes."
            />
            <McpAccessTokensCard tokens={mcpAccessTokens} />
          </section>

          <section
            id={`${tabsId}-activity-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-activity-tab`}
            hidden={activeTab !== "activity"}
            className={styles.panel}
          >
            <SettingsSectionIntro
              title="Activity"
              description="Check whether your changes are saved and review recent work."
            />
            <dl className={styles.metrics}>
              <SettingsMetric
                label="Waiting"
                value={queuedItems.length}
                caption="Changes still being saved"
              />
              <SettingsMetric
                label="Recent"
                value={operationLogs.length}
                caption="Changes shown below"
              />
            </dl>
            <WaitingChangesSection
              queuedItems={queuedItems}
              onClearQueue={clearLocalSyncQueue}
            />
            <RecentChangesSection operationLogs={operationLogs} />
          </section>
        </main>
      </div>
    </div>
  );
}

function SettingsHeader({
  appVersion,
  connectionCount,
}: {
  appVersion: string;
  connectionCount: number;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.pageDescription}>
          Updates, connected apps, and saving activity.
        </p>
      </div>
      <dl className={styles.summary} aria-label="Settings summary">
        <SummaryItem label="Version" value={`v${appVersion}`} />
        <SummaryItem
          label="Connected apps"
          value={String(connectionCount)}
        />
      </dl>
    </header>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryItem}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SettingsSectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className={styles.sectionIntro}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionDescription}>{description}</p>
    </header>
  );
}

function SettingsMetric({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span>{caption}</span>
    </div>
  );
}

function WaitingChangesSection({
  queuedItems,
  onClearQueue,
}: {
  queuedItems: LocalSyncQueueItem[];
  onClearQueue: () => void;
}) {
  return (
    <section className={styles.contentSection}>
      <div className={styles.contentSectionHeader}>
        <div>
          <h3>Waiting to save</h3>
          <p>Changes that have not finished saving yet.</p>
        </div>
        <Button
          variant="text"
          onClick={onClearQueue}
          disabled={queuedItems.length === 0}
        >
          Clear list
        </Button>
      </div>

      <ul className={styles.dataList}>
        {queuedItems.length === 0 ? (
          <li className={styles.emptyRow}>Everything is saved.</li>
        ) : (
          queuedItems.map((item) => (
            <li key={item.id} className={styles.dataRow}>
              <span>
                <strong>
                  {describeChange(item.entityType, item.actionType)}
                </strong>
                <small>
                  Waiting since {new Date(item.queuedAt).toLocaleString("en-US")}
                </small>
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function RecentChangesSection({
  operationLogs,
}: {
  operationLogs: OperationLogView[];
}) {
  return (
    <section className={styles.contentSection}>
      <div className={styles.contentSectionHeader}>
        <div>
          <h3>Recent changes</h3>
          <p>Your latest saved work.</p>
        </div>
      </div>

      <ul className={styles.dataList}>
        {operationLogs.length === 0 ? (
          <li className={styles.emptyRow}>No recent changes yet.</li>
        ) : (
          operationLogs.map((entry) => (
            <li key={entry.id} className={styles.dataRow}>
              <span>
                <strong>
                  {describeChange(entry.entityType, entry.actionType)}
                </strong>
                <small>
                  {new Date(entry.createdAt).toLocaleString("en-US")}
                </small>
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
