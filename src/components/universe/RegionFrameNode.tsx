"use client";

import type { NodeProps } from "@xyflow/react";
import type { UniverseRegionFrameNode } from "./universe.types";

export function RegionFrameNode({
  data,
}: NodeProps<UniverseRegionFrameNode>) {
  return (
    <div className="universe-region-frame">
      <div className="universe-region-label">{data.label}</div>
      <p className="universe-region-caption">{data.caption}</p>
    </div>
  );
}
