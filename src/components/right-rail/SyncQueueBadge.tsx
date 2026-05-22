"use client";

import { useLocalSyncQueueCount } from "@/lib/local-sync";

export function SyncQueueBadge() {
  const count = useLocalSyncQueueCount();
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className="right-rail-btn sync-queue-badge"
      title={`${count} mutation${count === 1 ? "" : "s"} pending sync`}
      aria-label={`${count} mutations pending sync`}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: "16px", lineHeight: 1 }}
        aria-hidden="true"
      >
        sync
      </span>
      <span className="sync-queue-badge-count">{count}</span>
    </button>
  );
}
