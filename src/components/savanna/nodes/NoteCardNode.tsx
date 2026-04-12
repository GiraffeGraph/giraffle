"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";

export type NoteCardNodeData = {
  noteId: string;
  title: string;
  icon: string | null;
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
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="svn-handle"
      />
      <div
        className="svn-node-note__inner"
        onDoubleClick={() => router.push(`/notes/${data.noteId}`)}
      >
        <span className="svn-node-note__icon">
          {renderStoredIcon(data.icon, { fallback: "📄" })}
        </span>
        <span className="svn-node-note__title">{data.title || "Untitled"}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="svn-handle"
      />
    </div>
  );
}
