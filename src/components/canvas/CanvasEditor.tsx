"use client";

import React, { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NoteNode } from './NoteNode';

const nodeTypes = {
  note: NoteNode,
};

export interface CanvasEditorProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  title?: string;
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export function CanvasEditor({ initialNodes = [], initialEdges = [], title = "Uzamsal Harita", onSave }: CanvasEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, type: 'default', animated: true }, eds)),
    [setEdges]
  );

  const handleSave = () => {
    if (onSave) {
      onSave(nodes, edges);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%' }} className="graffle-canvas-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Panel position="top-left" className="graffle-canvas-panel">
          <div className="graffle-canvas-title">{title}</div>
        </Panel>
        <Panel position="top-right" className="graffle-canvas-panel-tools">
          <button onClick={handleSave} className="graffle-canvas-save-btn">Haritayı Kaydet</button>
        </Panel>
        
        <Controls className="graffle-canvas-controls" />
        <MiniMap 
          nodeColor="var(--surface-3)" 
          maskColor="var(--surface-glass-muted)"
          style={{ background: 'var(--bg-page-deep)', border: '1px solid var(--border-soft)', borderRadius: '12px' }}
        />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border-strong)" />
      </ReactFlow>
    </div>
  );
}
