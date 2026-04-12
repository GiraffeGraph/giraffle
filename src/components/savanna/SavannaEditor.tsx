"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSavannaStateAction } from "@/server/api/savanna";
import { NoteCardNode, type NoteCardNodeData } from "./nodes/NoteCardNode";
import { LabelNode, type LabelNodeData } from "./nodes/LabelNode";
import { ZoneNode, type ZoneNodeData } from "./nodes/ZoneNode";

type SavannaNote = {
  id: string;
  title: string;
  icon: string | null;
};

type DbCanvasNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  noteId: string | null;
  data: unknown;
  color: string | null;
  note: { id: string; title: string; icon: string | null } | null;
};

type DbCanvasEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
};

type SavannaCanvas = {
  id: string;
  title: string;
  cameraX: number;
  cameraY: number;
  zoom: number;
  nodes: DbCanvasNode[];
  edges: DbCanvasEdge[];
};

interface SavannaEditorProps {
  canvas: SavannaCanvas;
  notes: SavannaNote[];
}

const NODE_TYPES: NodeTypes = {
  noteCard: NoteCardNode,
  label: LabelNode,
  zone: ZoneNode,
};

function dbNodesToFlow(dbNodes: DbCanvasNode[]): Node[] {
  return dbNodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    style: { width: n.width, height: n.type === "zone" ? n.height : undefined },
    data:
      n.type === "noteCard"
        ? {
            noteId: n.noteId ?? "",
            title: (n.data as NoteCardNodeData)?.title ?? n.note?.title ?? "Untitled",
            icon: (n.data as NoteCardNodeData)?.icon ?? n.note?.icon ?? null,
          }
        : n.type === "label"
        ? { text: (n.data as LabelNodeData)?.text ?? "" }
        : { label: (n.data as ZoneNodeData)?.label ?? "", color: n.color },
    zIndex: n.type === "zone" ? -1 : 0,
    draggable: true,
    selectable: true,
  }));
}

function dbEdgesToFlow(dbEdges: DbCanvasEdge[]): Edge[] {
  return dbEdges.map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    type: "default",
    animated: false,
    style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
  }));
}

function generateId() {
  return crypto.randomUUID();
}

type CursorMode = "interact" | "move";
type SaveStatus = "saved" | "saving" | "unsaved";

function SavannaCanvas({ canvas, notes }: SavannaEditorProps) {
  const router = useRouter();
  const { setViewport, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(dbNodesToFlow(canvas.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(dbEdgesToFlow(canvas.edges));
  const [cursorMode, setCursorMode] = useState<CursorMode>("interact");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [notePanelOpen, setNotePanelOpen] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const latestNodesRef = useRef(nodes);
  const latestEdgesRef = useRef(edges);
  const lastCameraRef = useRef<Viewport>({
    x: canvas.cameraX,
    y: canvas.cameraY,
    zoom: canvas.zoom,
  });

  // Keep refs in sync
  useEffect(() => { latestNodesRef.current = nodes; }, [nodes]);
  useEffect(() => { latestEdgesRef.current = edges; }, [edges]);

  // Restore camera on mount
  useEffect(() => {
    setViewport({ x: canvas.cameraX, y: canvas.cameraY, zoom: canvas.zoom }, { duration: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    };
  }, []);

  const triggerSave = useCallback(() => {
    setSaveStatus("unsaved");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaveStatus("saving");
      const currentNodes = latestNodesRef.current;
      const currentEdges = latestEdgesRef.current;
      const camera = lastCameraRef.current;

      await saveSavannaStateAction(
        canvas.id,
        currentNodes.map((n) => ({
          id: n.id,
          type: n.type ?? "noteCard",
          x: n.position.x,
          y: n.position.y,
          width: (n.style?.width as number) ?? 220,
          height: (n.style?.height as number) ?? 80,
          noteId: (n.data as NoteCardNodeData).noteId ?? null,
          data: n.data as Record<string, unknown>,
          color: (n.data as ZoneNodeData).color ?? null,
        })),
        currentEdges.map((e) => ({
          id: e.id,
          sourceNodeId: e.source,
          targetNodeId: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
        camera
      );
      setSaveStatus("saved");
    }, 1500);
  }, [canvas.id]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: generateId(),
            type: "default",
            animated: false,
            style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
          },
          eds
        )
      );
      triggerSave();
    },
    [setEdges, triggerSave]
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const hasMeaningfulChange = changes.some(
        (c) => c.type === "position" || c.type === "remove" || c.type === "dimensions"
      );
      if (hasMeaningfulChange) triggerSave();
    },
    [onNodesChange, triggerSave]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (changes.some((c) => c.type === "remove")) triggerSave();
    },
    [onEdgesChange, triggerSave]
  );

  const handleMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      lastCameraRef.current = viewport;
      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = window.setTimeout(async () => {
        setSaveStatus("saving");
        await saveSavannaStateAction(
          canvas.id,
          latestNodesRef.current.map((n) => ({
            id: n.id,
            type: n.type ?? "noteCard",
            x: n.position.x,
            y: n.position.y,
            width: (n.style?.width as number) ?? 220,
            height: (n.style?.height as number) ?? 80,
            noteId: (n.data as NoteCardNodeData).noteId ?? null,
            data: n.data as Record<string, unknown>,
            color: (n.data as ZoneNodeData).color ?? null,
          })),
          latestEdgesRef.current.map((e) => ({
            id: e.id,
            sourceNodeId: e.source,
            targetNodeId: e.target,
            sourceHandle: e.sourceHandle ?? null,
            targetHandle: e.targetHandle ?? null,
          })),
          viewport
        );
        setSaveStatus("saved");
      }, 1200);
    },
    [canvas.id]
  );

  const addNoteCard = useCallback(
    (note: SavannaNote) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const offset = (Math.random() - 0.5) * 200;
      const newNode: Node = {
        id: generateId(),
        type: "noteCard",
        position: { x: center.x + offset, y: center.y + offset },
        data: { noteId: note.id, title: note.title, icon: note.icon } satisfies NoteCardNodeData,
        style: { width: 220 },
      };
      setNodes((nds) => [...nds, newNode]);
      triggerSave();
    },
    [screenToFlowPosition, setNodes, triggerSave]
  );

  const addLabel = useCallback(() => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const offset = (Math.random() - 0.5) * 120;
    const newNode: Node = {
      id: generateId(),
      type: "label",
      position: { x: center.x + offset, y: center.y + offset },
      data: { text: "New label" } satisfies LabelNodeData,
    };
    setNodes((nds) => [...nds, newNode]);
    triggerSave();
  }, [screenToFlowPosition, setNodes, triggerSave]);

  const addZone = useCallback(() => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const newNode: Node = {
      id: generateId(),
      type: "zone",
      position: { x: center.x - 200, y: center.y - 150 },
      data: { label: "New zone" } satisfies ZoneNodeData,
      style: { width: 400, height: 300 },
      zIndex: -1,
    };
    setNodes((nds) => [...nds, newNode]);
    triggerSave();
  }, [screenToFlowPosition, setNodes, triggerSave]);

  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, noteSearch]);

  const placedNoteIds = useMemo(
    () =>
      new Set(
        nodes
          .filter((n) => n.type === "noteCard")
          .map((n) => (n.data as NoteCardNodeData).noteId)
      ),
    [nodes]
  );

  return (
    <div className="svn-shell" data-cursor-mode={cursorMode}>
      {/* Note picker panel */}
      <div className={`svn-note-panel${notePanelOpen ? " svn-note-panel--open" : ""}`}>
        <div className="svn-note-panel__header">
          <span className="svn-note-panel__title">Notes</span>
          <button
            type="button"
            className="svn-note-panel__close"
            onClick={() => setNotePanelOpen(false)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="svn-note-panel__search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            placeholder="Search notes…"
            value={noteSearch}
            onChange={(e) => setNoteSearch(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="svn-note-panel__list">
          {filteredNotes.length === 0 ? (
            <div className="svn-note-panel__empty">No notes found</div>
          ) : (
            filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={`svn-note-panel__item${
                  placedNoteIds.has(note.id) ? " svn-note-panel__item--placed" : ""
                }`}
                onClick={() => addNoteCard(note)}
                title={placedNoteIds.has(note.id) ? "Already on canvas" : "Add to canvas"}
              >
                <span className="svn-note-panel__item-title">{note.title || "Untitled"}</span>
                {placedNoteIds.has(note.id) && (
                  <span className="material-symbols-outlined svn-note-panel__item-check">
                    check
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onMoveEnd={handleMoveEnd}
        fitView={canvas.nodes.length > 0}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={cursorMode === "move"}
        nodesDraggable={cursorMode === "interact"}
        nodesConnectable={cursorMode === "interact"}
        elementsSelectable={cursorMode === "interact"}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="var(--border-strong)"
        />
        <MiniMap
          nodeColor="var(--surface-3)"
          maskColor="rgba(15,15,15,0.2)"
          className="svn-minimap"
          style={{
            background: "var(--surface-glass-strong)",
            border: "1px solid var(--border-soft)",
            borderRadius: "14px",
          }}
        />

        {/* Back + save status */}
        <Panel position="top-left" className="svn-top-left">
          <button
            type="button"
            className="svn-back-btn"
            onClick={() => router.push("/savanna")}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="svn-canvas-title">{canvas.title}</div>
          <div
            className={`svn-save-status svn-save-status--${saveStatus}`}
            aria-live="polite"
          >
            {saveStatus === "saving" && (
              <>
                <span className="svn-save-dot" />
                Saving…
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <span className="material-symbols-outlined">cloud_done</span>
                Saved
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="svn-save-dot svn-save-dot--unsaved" />
                Unsaved
              </>
            )}
          </div>
        </Panel>

        {/* Right toolbar */}
        <Panel position="top-right" className="svn-toolbar">
          <button
            type="button"
            className="svn-toolbar__btn"
            onClick={() => setNotePanelOpen((v) => !v)}
            title="Add note"
            aria-pressed={notePanelOpen}
          >
            <span className="material-symbols-outlined">note_add</span>
          </button>
          <button
            type="button"
            className="svn-toolbar__btn"
            onClick={addLabel}
            title="Add label"
          >
            <span className="material-symbols-outlined">label</span>
          </button>
          <button
            type="button"
            className="svn-toolbar__btn"
            onClick={addZone}
            title="Add zone"
          >
            <span className="material-symbols-outlined">rectangle</span>
          </button>
          <div className="svn-toolbar__divider" />
          <button
            type="button"
            className={`svn-toolbar__btn svn-toolbar__btn--mode${
              cursorMode === "interact" ? " svn-toolbar__btn--active" : ""
            }`}
            onClick={() => setCursorMode("interact")}
            title="Interact mode"
          >
            <span className="material-symbols-outlined">ads_click</span>
          </button>
          <button
            type="button"
            className={`svn-toolbar__btn svn-toolbar__btn--mode${
              cursorMode === "move" ? " svn-toolbar__btn--active" : ""
            }`}
            onClick={() => setCursorMode("move")}
            title="Pan mode"
          >
            <span className="material-symbols-outlined">pan_tool_alt</span>
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function SavannaEditor(props: SavannaEditorProps) {
  return (
    <ReactFlowProvider>
      <SavannaCanvas {...props} />
    </ReactFlowProvider>
  );
}
