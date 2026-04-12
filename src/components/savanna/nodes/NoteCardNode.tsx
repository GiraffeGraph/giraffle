"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";

export type NoteCardNodeData = {
  noteId: string;
  title: string;
  icon: string | null;
  preview?: string | null;
  onOpenPreview?: (noteId: string) => void;
  previewEnabled?: boolean;
};

export function NoteCardNode({
  data,
  selected,
  isConnectable,
}: NodeProps<Node<NoteCardNodeData>>) {
  const router = useRouter();

  return (
    <div className={`svn-node-note${selected ? " svn-node-note--selected" : ""}`}>
      <Handle
        id="note-target"
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="svn-handle"
      />

      <div
        className="svn-node-note__inner"
        onClick={() => {
          if (data.previewEnabled === false) return;
          data.onOpenPreview?.(data.noteId);
        }}
        onDoubleClick={() => router.push(`/notes/${data.noteId}`)}
      >
        <span className="svn-node-note__icon">
          {renderStoredIcon(data.icon, { fallback: "📄" })}
        </span>
        <span className="svn-node-note__content">
          <span className="svn-node-note__title">{data.title || "Untitled"}</span>
          {data.preview ? <span className="svn-node-note__preview">{data.preview}</span> : null}
        </span>
      </div>

      <Handle
        id="note-source"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="svn-handle"
      />
    </div>
  );
}
