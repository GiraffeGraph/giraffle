"use client";

import type { NodeProps } from "@xyflow/react";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import type { UniverseSettingsNode } from "./universe.types";

export function SettingsNode({ data }: NodeProps<UniverseSettingsNode>) {
  return (
    <div className="universe-panel-node nowheel nodrag">
      <div className="universe-panel-header">
        <span className="material-symbols-outlined" aria-hidden="true">
          settings
        </span>
        Ayarlar
      </div>
      <div className="universe-panel-body">
        <SettingsWorkspace
          operationLogs={data.operationLogs}
          embedded
          showHeading={false}
        />
      </div>
    </div>
  );
}
