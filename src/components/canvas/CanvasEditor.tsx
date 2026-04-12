"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useCallback } from "react";
import "@xyflow/react/dist/style.css";
import { NoteNode } from "./NoteNode";

const nodeTypes = {
  note: NoteNode,
};

export interface CanvasEditorProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  title?: string;
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export function CanvasEditor({
  initialNodes = [],
  initialEdges = [],
  title = "Uzamsal Harita",
  onSave,
}: CanvasEditorProps) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((existingEdges) =>
        addEdge({ ...params, type: "default", animated: true }, existingEdges)
      ),
    [setEdges]
  );

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      className="giraffle-canvas-container"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Panel position="top-left" className="giraffle-canvas-panel">
          <div className="giraffle-canvas-title">{title}</div>
        </Panel>
        <Panel position="top-right" className="giraffle-canvas-panel-tools">
          <button
            type="button"
            onClick={() => onSave?.(nodes, edges)}
            className="giraffle-canvas-save-btn"
          >
            Haritayı Kaydet
          </button>
        </Panel>

        <Controls className="giraffle-canvas-controls" />
        <MiniMap
          nodeColor="var(--surface-3)"
          maskColor="var(--surface-glass-muted)"
          style={{
            background: "var(--bg-page-deep)",
            border: "1px solid var(--border-soft)",
            borderRadius: "12px",
          }}
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--border-strong)"
        />
      </ReactFlow>
    </div>
  );
}
