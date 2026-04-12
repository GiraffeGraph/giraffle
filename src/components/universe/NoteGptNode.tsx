"use client";

import type { NodeProps } from "@xyflow/react";
import { NoteGptWorkspace } from "@/components/notegpt/NoteGptWorkspace";
import type { UniverseNoteGptNode } from "./universe.types";

export function NoteGptNode({ data }: NodeProps<UniverseNoteGptNode>) {
  return (
    <div className="universe-panel-node universe-panel-node--notegpt nowheel nodrag">
      <div className="universe-panel-header">
        <span className="material-symbols-outlined" aria-hidden="true">
          smart_toy
        </span>
        Spotter
      </div>
      <div className="universe-panel-body">
        <NoteGptWorkspace
          notes={data.notes}
          folders={data.folders}
          embedded
        />
      </div>
    </div>
  );
}
