"use client";

import type { NodeProps } from "@xyflow/react";
import { SpotterWorkspace } from "@/components/spotter/SpotterWorkspace";
import type { UniverseSpotterNode } from "./universe.types";

export function SpotterNode({ data }: NodeProps<UniverseSpotterNode>) {
  return (
    <div className="universe-panel-node universe-panel-node--spotter nowheel nodrag">
      <div className="universe-panel-header">
        <span className="material-symbols-outlined" aria-hidden="true">
          smart_toy
        </span>
        Spotter
      </div>
      <div className="universe-panel-body">
        <SpotterWorkspace
          notes={data.notes}
          folders={data.folders}
          embedded
        />
      </div>
    </div>
  );
}
