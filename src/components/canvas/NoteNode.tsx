"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";

type CanvasNoteData = {
  note?: {
    id?: string | null;
    icon?: string | null;
    title?: string | null;
  } | null;
  snippet?: string | null;
};

export function NoteNode({ data, isConnectable }: NodeProps<Node<CanvasNoteData>>) {
  const router = useRouter();

  return (
    <div className="giraffle-canvas-node-note">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="giraffle-handle"
      />
      <div
        className="giraffle-node-inner"
        onClick={() => {
          if (data.note?.id) {
            router.push(`/notes/${data.note.id}`);
          }
        }}
      >
        <div className="giraffle-node-header">
          <span className="giraffle-node-icon">
            {renderStoredIcon(data.note?.icon, { fallback: "📄" })}
          </span>
          <span className="giraffle-node-title">
            {data.note?.title || "İsimsiz Not"}
          </span>
        </div>
        <div className="giraffle-node-body">
          {data.snippet || "İçeriği görmek için tıklayın..."}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="giraffle-handle"
      />
    </div>
  );
}
