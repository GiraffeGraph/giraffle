"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
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
import { SafeEditor } from "@/components/editor/SafeEditor";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";
import {
  createNoteFromWikilinkAction,
  findNoteByTitleAction,
  saveNoteContentAction,
  searchNotesByTitleAction,
  updateNoteAction,
} from "@/server/api/notes";
import {
  getSavannaNoteEditorAction,
  saveSavannaCameraAction,
  saveSavannaStateAction,
} from "@/server/api/savanna";
import { DrawNode, type DrawNodeData, type DrawStroke } from "./nodes/DrawNode";
import { NoteCardNode, type NoteCardNodeData } from "./nodes/NoteCardNode";
import { LabelNode, type LabelNodeData } from "./nodes/LabelNode";
import { ZoneNode, type ZoneNodeData } from "./nodes/ZoneNode";
import { TextBlockNode, type TextBlockNodeData } from "./nodes/TextBlockNode";

type SavannaNote = {
  id: string;
  title: string;
  icon: string | null;
};

type SavannaEditableNote = {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: string | Date;
  summary: string;
  document: TiptapDocument;
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
  textBlock: TextBlockNode,
  draw: DrawNode,
};

function dbNodesToFlow(dbNodes: DbCanvasNode[]): Node[] {
  return dbNodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    style: {
      width: n.width,
      height: n.type === "zone" || n.type === "textBlock" || n.type === "draw" ? n.height : undefined,
    },
    data:
      n.type === "noteCard"
        ? {
            noteId: n.noteId ?? "",
            title: (n.data as NoteCardNodeData)?.title ?? n.note?.title ?? "Untitled",
            icon: (n.data as NoteCardNodeData)?.icon ?? n.note?.icon ?? null,
            preview: (n.data as NoteCardNodeData)?.preview ?? null,
          }
        : n.type === "label"
          ? { text: (n.data as LabelNodeData)?.text ?? "" }
          : n.type === "textBlock"
            ? { text: (n.data as TextBlockNodeData)?.text ?? "" }
            : n.type === "draw"
              ? { strokes: (n.data as DrawNodeData)?.strokes ?? [] }
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

function serializeNodeData(node: Node): Record<string, unknown> {
  if (node.type === "noteCard") {
    const data = node.data as NoteCardNodeData;
    return {
      noteId: data.noteId,
      title: data.title,
      icon: data.icon ?? null,
      preview: typeof data.preview === "string" ? data.preview : null,
    };
  }

  if (node.type === "label") {
    const data = node.data as LabelNodeData;
    return { text: data.text ?? "" };
  }

  if (node.type === "textBlock") {
    const data = node.data as TextBlockNodeData;
    return { text: data.text ?? "" };
  }

  if (node.type === "zone") {
    const data = node.data as ZoneNodeData;
    return {
      label: data.label ?? "",
      color: data.color ?? null,
    };
  }

  if (node.type === "draw") {
    const data = node.data as DrawNodeData;
    return {
      strokes: Array.isArray(data.strokes) ? data.strokes : [],
    };
  }

  return {};
}

function flowNodesToPayload(nodes: Node[]) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type ?? "noteCard",
    x: n.position.x,
    y: n.position.y,
    width: (n.style?.width as number) ?? 220,
    height: (n.style?.height as number) ?? (n.type === "textBlock" ? 180 : n.type === "draw" ? 260 : 80),
    noteId: n.type === "noteCard" ? ((n.data as NoteCardNodeData).noteId ?? null) : null,
    data: serializeNodeData(n),
    color: n.type === "zone" ? ((n.data as ZoneNodeData).color ?? null) : null,
  }));
}

function flowEdgesToPayload(edges: Edge[]) {
  return edges.map((e) => ({
    id: e.id,
    sourceNodeId: e.source,
    targetNodeId: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
}

function generateId() {
  return crypto.randomUUID();
}

function extractTextFromDocumentNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const value = node as { text?: unknown; content?: unknown };
  const text = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.content)
    ? value.content.map((child) => extractTextFromDocumentNode(child)).join("")
    : "";

  return `${text}${children}`;
}

function summarizeDocument(document: TiptapDocument | null | undefined, maxLength = 180): string {
  if (!document) return "";

  const text = extractTextFromDocumentNode(document).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

type SaveStatus = "saved" | "saving" | "unsaved";

type InspectorStatus = "closed" | "loading" | "ready" | "error";

function SavannaCanvas({ canvas, notes }: SavannaEditorProps) {
  const router = useRouter();
  const { setViewport, screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(dbNodesToFlow(canvas.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(dbEdgesToFlow(canvas.edges));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [notePanelOpen, setNotePanelOpen] = useState(canvas.nodes.length === 0);
  const [noteSearch, setNoteSearch] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceNodeId, setLinkSourceNodeId] = useState<string | null>(null);
  const [inspectorStatus, setInspectorStatus] = useState<InspectorStatus>("closed");
  const [inspectorNoteId, setInspectorNoteId] = useState<string | null>(null);
  const [inspectorNote, setInspectorNote] = useState<SavannaEditableNote | null>(null);
  const [inspectorTitleDraft, setInspectorTitleDraft] = useState("");
  const [inspectorSaveState, setInspectorSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveTimerRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const latestNodesRef = useRef(nodes);
  const latestEdgesRef = useRef(edges);
  const inspectorRequestRef = useRef(0);
  const lastCameraRef = useRef<Viewport>({
    x: canvas.cameraX,
    y: canvas.cameraY,
    zoom: canvas.zoom,
  });

  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    latestEdgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    setViewport({ x: canvas.cameraX, y: canvas.cameraY, zoom: canvas.zoom }, { duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setInspectorTitleDraft(inspectorNote?.title ?? "");
  }, [inspectorNote?.id, inspectorNote?.title]);

  useEffect(() => {
    if (!linkMode) setLinkSourceNodeId(null);
  }, [linkMode]);

  useEffect(() => {
    if (!linkSourceNodeId) return;
    const exists = nodes.some((node) => node.id === linkSourceNodeId);
    if (!exists) setLinkSourceNodeId(null);
  }, [linkSourceNodeId, nodes]);

  const triggerSave = useCallback(() => {
    setSaveStatus("unsaved");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaveStatus("saving");

      try {
        await saveSavannaStateAction(
          canvas.id,
          flowNodesToPayload(latestNodesRef.current),
          flowEdgesToPayload(latestEdgesRef.current),
          lastCameraRef.current,
        );
        setSaveStatus("saved");
      } catch (error) {
        console.error("Failed to save Savanna state:", error);
        setSaveStatus("unsaved");
      }
    }, 1200);
  }, [canvas.id]);

  const addConnectionByNodeIds = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      if (sourceNodeId === targetNodeId) return;

      const exists = latestEdgesRef.current.some(
        (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
      );
      if (exists) return;

      setEdges((current) =>
        addEdge(
          {
            id: generateId(),
            source: sourceNodeId,
            target: targetNodeId,
            type: "default",
            animated: false,
            style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
          },
          current,
        ),
      );

      triggerSave();
    },
    [setEdges, triggerSave],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      addConnectionByNodeIds(connection.source, connection.target);
    },
    [addConnectionByNodeIds],
  );

  const onNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      if (!linkMode) return;

      if (!linkSourceNodeId) {
        setLinkSourceNodeId(node.id);
        return;
      }

      if (linkSourceNodeId === node.id) {
        setLinkSourceNodeId(null);
        return;
      }

      addConnectionByNodeIds(linkSourceNodeId, node.id);
      setLinkSourceNodeId(null);
    },
    [addConnectionByNodeIds, linkMode, linkSourceNodeId],
  );

  const onPaneClick = useCallback(() => {
    if (linkMode) setLinkSourceNodeId(null);
  }, [linkMode]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);

      const hasMeaningfulChange = changes.some(
        (change) =>
          change.type === "position" ||
          change.type === "remove" ||
          change.type === "dimensions" ||
          change.type === "replace" ||
          change.type === "add",
      );

      if (hasMeaningfulChange) triggerSave();
    },
    [onNodesChange, triggerSave],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);

      const hasMeaningfulChange = changes.some(
        (change) => change.type === "remove" || change.type === "replace" || change.type === "add",
      );

      if (hasMeaningfulChange) triggerSave();
    },
    [onEdgesChange, triggerSave],
  );

  const handleMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      lastCameraRef.current = viewport;

      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);

      cameraTimerRef.current = window.setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await saveSavannaCameraAction(canvas.id, viewport);
          setSaveStatus("saved");
        } catch (error) {
          console.error("Failed to persist Savanna camera:", error);
          setSaveStatus("unsaved");
        }
      }, 900);
    },
    [canvas.id],
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
        data: {
          noteId: note.id,
          title: note.title,
          icon: note.icon,
        } satisfies NoteCardNodeData,
        style: { width: 240 },
      };

      setNodes((current) => [...current, newNode]);
      triggerSave();
    },
    [screenToFlowPosition, setNodes, triggerSave],
  );

  const addLabel = useCallback(() => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode: Node = {
      id: generateId(),
      type: "label",
      position: { x: center.x, y: center.y },
      data: { text: "New label" } satisfies LabelNodeData,
    };

    setNodes((current) => [...current, newNode]);
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
      style: { width: 420, height: 320 },
      zIndex: -1,
    };

    setNodes((current) => [...current, newNode]);
    triggerSave();
  }, [screenToFlowPosition, setNodes, triggerSave]);

  const addTextBlock = useCallback(() => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode: Node = {
      id: generateId(),
      type: "textBlock",
      position: { x: center.x - 160, y: center.y - 90 },
      data: { text: "" } satisfies TextBlockNodeData,
      style: { width: 320, height: 180 },
    };

    setNodes((current) => [...current, newNode]);
    triggerSave();
  }, [screenToFlowPosition, setNodes, triggerSave]);

  const addDrawPad = useCallback(() => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode: Node = {
      id: generateId(),
      type: "draw",
      position: { x: center.x - 220, y: center.y - 140 },
      data: { strokes: [] } satisfies DrawNodeData,
      style: { width: 440, height: 280 },
    };

    setNodes((current) => [...current, newNode]);
    triggerSave();
  }, [screenToFlowPosition, setNodes, triggerSave]);

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

  const openNotePreview = useCallback(
    async (noteId: string) => {
      setInspectorNoteId(noteId);
      setInspectorStatus("loading");
      setInspectorSaveState("idle");

      const requestId = inspectorRequestRef.current + 1;
      inspectorRequestRef.current = requestId;

      try {
        const result = await getSavannaNoteEditorAction(noteId);
        if (requestId !== inspectorRequestRef.current) return;

        if (!result) {
          setInspectorNote(null);
          setInspectorStatus("error");
          return;
        }

        setInspectorNote(result);
        setInspectorStatus("ready");

        const preview = summarizeDocument(result.document);
        if (preview.length > 0) {
          setNodes((current) =>
            current.map((node) => {
              if (node.type !== "noteCard") return node;
              const data = node.data as NoteCardNodeData;
              if (data.noteId !== noteId) return node;
              return {
                ...node,
                data: {
                  ...data,
                  preview,
                } as NoteCardNodeData,
              };
            }),
          );
        }
      } catch (error) {
        if (requestId !== inspectorRequestRef.current) return;
        console.error("Failed to load note content for Savanna inspector:", error);
        setInspectorNote(null);
        setInspectorStatus("error");
      }
    },
    [setNodes],
  );

  const closeNotePreview = useCallback(() => {
    inspectorRequestRef.current += 1;
    setInspectorStatus("closed");
    setInspectorNoteId(null);
    setInspectorNote(null);
    setInspectorSaveState("idle");
  }, []);

  const handleInspectorTitleCommit = useCallback(async () => {
    if (!inspectorNoteId) return;

    const nextTitle = inspectorTitleDraft.trim();
    if (!nextTitle) {
      setInspectorTitleDraft(inspectorNote?.title ?? "");
      return;
    }

    if (nextTitle === inspectorNote?.title) return;

    try {
      setInspectorSaveState("saving");
      await updateNoteAction(inspectorNoteId, { title: nextTitle });

      setInspectorNote((current) =>
        current ? { ...current, title: nextTitle, updatedAt: new Date() } : current,
      );

      setNodes((current) =>
        current.map((node) => {
          if (node.type !== "noteCard") return node;
          const data = node.data as NoteCardNodeData;
          if (data.noteId !== inspectorNoteId) return node;
          return { ...node, data: { ...data, title: nextTitle } as NoteCardNodeData };
        }),
      );

      setInspectorSaveState("saved");
    } catch (error) {
      console.error("Failed to rename note from Savanna:", error);
      setInspectorSaveState("error");
    }
  }, [inspectorNote?.title, inspectorNoteId, inspectorTitleDraft, setNodes]);

  const handleInspectorSaveDocument = useCallback(
    async (document: TiptapDocument) => {
      if (!inspectorNoteId) return;

      try {
        setInspectorSaveState("saving");
        await saveNoteContentAction(inspectorNoteId, document);

        setInspectorNote((current) =>
          current ? { ...current, document, summary: summarizeDocument(document), updatedAt: new Date() } : current,
        );

        const preview = summarizeDocument(document);
        if (preview.length > 0) {
          setNodes((current) =>
            current.map((node) => {
              if (node.type !== "noteCard") return node;
              const data = node.data as NoteCardNodeData;
              if (data.noteId !== inspectorNoteId) return node;
              return { ...node, data: { ...data, preview } as NoteCardNodeData };
            }),
          );
          triggerSave();
        }

        setInspectorSaveState("saved");
      } catch (error) {
        console.error("Failed to save note content from Savanna:", error);
        setInspectorSaveState("error");
      }
    },
    [inspectorNoteId, setNodes, triggerSave],
  );

  const handleSearchWikilinks = useCallback(
    async (query: string): Promise<NoteReference[]> => searchNotesByTitleAction(query),
    [],
  );

  const handleResolveWikilink = useCallback(
    async (target: string): Promise<NoteReference | null> => findNoteByTitleAction(target),
    [],
  );

  const handleCreateWikilink = useCallback(
    async (target: string): Promise<NoteReference> => createNoteFromWikilinkAction(target),
    [],
  );

  const handleNavigateToNoteFromEditor = useCallback(
    async (noteId: string) => {
      await openNotePreview(noteId);
    },
    [openNotePreview],
  );

  const updateLabelText = useCallback(
    (nodeId: string, text: string) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...(node.data as LabelNodeData), text } }
            : node,
        ),
      );
      triggerSave();
    },
    [setNodes, triggerSave],
  );

  const updateZoneLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...(node.data as ZoneNodeData), label } }
            : node,
        ),
      );
      triggerSave();
    },
    [setNodes, triggerSave],
  );

  const updateTextBlock = useCallback(
    (nodeId: string, text: string) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...(node.data as TextBlockNodeData), text } }
            : node,
        ),
      );
      triggerSave();
    },
    [setNodes, triggerSave],
  );

  const updateDrawStrokes = useCallback(
    (nodeId: string, strokes: DrawStroke[]) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...(node.data as DrawNodeData), strokes } }
            : node,
        ),
      );
      triggerSave();
    },
    [setNodes, triggerSave],
  );

  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((node) => {
        if (node.type === "noteCard") {
          const data = node.data as NoteCardNodeData;
          const sourceNote = noteById.get(data.noteId);

          return {
            ...node,
            data: {
              ...data,
              title: sourceNote?.title ?? data.title,
              icon: sourceNote?.icon ?? data.icon,
              onOpenPreview: openNotePreview,
              previewEnabled: !linkMode,
              linkSelected: linkMode && linkSourceNodeId === node.id,
            } as NoteCardNodeData,
          };
        }

        if (node.type === "label") {
          return {
            ...node,
            data: {
              ...(node.data as LabelNodeData),
              onTextChange: (text: string) => updateLabelText(node.id, text),
            } as LabelNodeData,
          };
        }

        if (node.type === "zone") {
          return {
            ...node,
            data: {
              ...(node.data as ZoneNodeData),
              onLabelChange: (label: string) => updateZoneLabel(node.id, label),
            } as ZoneNodeData,
          };
        }

        if (node.type === "textBlock") {
          return {
            ...node,
            data: {
              ...(node.data as TextBlockNodeData),
              onTextChange: (text: string) => updateTextBlock(node.id, text),
            } as TextBlockNodeData,
          };
        }

        if (node.type === "draw") {
          return {
            ...node,
            data: {
              ...(node.data as DrawNodeData),
              onStrokesChange: (strokes: DrawStroke[]) => updateDrawStrokes(node.id, strokes),
            } as DrawNodeData,
          };
        }

        return node;
      }),
    [
      linkMode,
      linkSourceNodeId,
      noteById,
      nodes,
      openNotePreview,
      updateDrawStrokes,
      updateLabelText,
      updateTextBlock,
      updateZoneLabel,
    ],
  );

  const focusContent = useCallback(() => {
    if (latestNodesRef.current.length === 0) {
      void setViewport({ x: 0, y: 0, zoom: canvas.zoom }, { duration: 280 });
      return;
    }

    void fitView({ padding: 0.2, duration: 280 });
  }, [canvas.zoom, fitView, setViewport]);

  const filteredNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(query));
  }, [noteSearch, notes]);

  const placedNoteIds = useMemo(
    () =>
      new Set(
        nodes
          .filter((node) => node.type === "noteCard")
          .map((node) => (node.data as NoteCardNodeData).noteId),
      ),
    [nodes],
  );

  const inspectorFallbackNote = useMemo(
    () => (inspectorNoteId ? noteById.get(inspectorNoteId) ?? null : null),
    [inspectorNoteId, noteById],
  );

  const inspectorTitle = inspectorNote?.title ?? inspectorFallbackNote?.title ?? "Note";

  const inspectorSaveHint =
    inspectorSaveState === "saving"
      ? "Saving note…"
      : inspectorSaveState === "saved"
        ? "Note saved"
        : inspectorSaveState === "error"
          ? "Could not save note"
          : "";

  const linkHint = linkMode
    ? linkSourceNodeId
      ? "Select a second node to draw a line"
      : "Select a node to start linking"
    : "";

  return (
    <div className="svn-shell">
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
            onChange={(event) => setNoteSearch(event.target.value)}
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
                  <span className="material-symbols-outlined svn-note-panel__item-check">check</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <aside className={`svn-note-inspector${inspectorStatus !== "closed" ? " svn-note-inspector--open" : ""}`}>
        <header className="svn-note-inspector__header">
          <div className="svn-note-inspector__title-wrap">
            <span className="svn-note-inspector__eyebrow">Note</span>
            {inspectorStatus === "ready" ? (
              <input
                className="svn-note-inspector__title-input"
                value={inspectorTitleDraft}
                onChange={(event) => setInspectorTitleDraft(event.target.value)}
                onBlur={() => void handleInspectorTitleCommit()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleInspectorTitleCommit();
                  }
                  if (event.key === "Escape") {
                    setInspectorTitleDraft(inspectorNote?.title ?? inspectorTitle);
                  }
                }}
                aria-label="Note title"
              />
            ) : (
              <h3 className="svn-note-inspector__title">{inspectorTitle}</h3>
            )}
            {inspectorSaveHint ? (
              <span
                className={`svn-note-inspector__save svn-note-inspector__save--${inspectorSaveState}`}
              >
                {inspectorSaveHint}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="svn-note-inspector__close"
            onClick={closeNotePreview}
            aria-label="Close note preview"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="svn-note-inspector__body">
          {inspectorStatus === "loading" && (
            <p className="svn-note-inspector__state">Loading note editor…</p>
          )}

          {inspectorStatus === "error" && (
            <p className="svn-note-inspector__state svn-note-inspector__state--error">
              Couldn’t load this note right now.
            </p>
          )}

          {inspectorStatus === "ready" && inspectorNote && (
            <div className="svn-note-inspector__editor-shell">
              <div className="svn-note-inspector__editor">
                <SafeEditor
                  key={`${inspectorNote.id}:${new Date(inspectorNote.updatedAt).getTime()}`}
                  noteId={inspectorNote.id}
                  initialContent={inspectorNote.document}
                  onSave={handleInspectorSaveDocument}
                  searchWikilinkNotes={handleSearchWikilinks}
                  resolveWikilinkNote={handleResolveWikilink}
                  createWikilinkNote={handleCreateWikilink}
                  onNavigateToNote={handleNavigateToNoteFromEditor}
                />
              </div>
              <button
                type="button"
                className="svn-note-inspector__open-btn"
                onClick={() => router.push(`/notes/${inspectorNote.id}`)}
              >
                <span className="material-symbols-outlined">open_in_new</span>
                Open full note
              </button>
            </div>
          )}
        </div>
      </aside>

      <header className="svn-topbar">
        <div className="svn-topbar__left">
          <button
            type="button"
            className="svn-topbar__back"
            onClick={() => router.push("/savanna")}
            aria-label="Back to Savanna list"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="svn-topbar__title-wrap">
            <h1 className="svn-topbar__title">{canvas.title}</h1>
            {linkHint ? <p className="svn-topbar__hint">{linkHint}</p> : null}
          </div>
        </div>

        <div className="svn-topbar__actions">
          <button
            type="button"
            className="svn-topbar__btn"
            onClick={() => setNotePanelOpen((current) => !current)}
            title="Toggle notes panel"
          >
            <span className="material-symbols-outlined">note_add</span>
            Notes
          </button>
          <button type="button" className="svn-topbar__btn" onClick={addTextBlock}>
            <span className="material-symbols-outlined">edit_note</span>
            Text
          </button>
          <button type="button" className="svn-topbar__btn" onClick={addDrawPad}>
            <span className="material-symbols-outlined">draw</span>
            Draw
          </button>
          <button type="button" className="svn-topbar__btn" onClick={addLabel}>
            <span className="material-symbols-outlined">label</span>
            Label
          </button>
          <button type="button" className="svn-topbar__btn" onClick={addZone}>
            <span className="material-symbols-outlined">crop_square</span>
            Zone
          </button>
          <button
            type="button"
            className={`svn-topbar__btn${linkMode ? " svn-topbar__btn--active" : ""}`}
            onClick={() => setLinkMode((current) => !current)}
          >
            <span className="material-symbols-outlined">timeline</span>
            Line
          </button>
          <button type="button" className="svn-topbar__btn" onClick={focusContent}>
            <span className="material-symbols-outlined">center_focus_strong</span>
            Focus
          </button>

          <div className={`svn-save-status svn-save-status--${saveStatus}`} aria-live="polite">
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
        </div>
      </header>

      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={handleMoveEnd}
        connectionMode={ConnectionMode.Loose}
        fitView={canvas.nodes.length > 0}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        panOnDrag
        nodesDraggable
        nodesConnectable
        elementsSelectable
        deleteKeyCode={["Backspace", "Delete"]}
        selectionOnDrag={!linkMode}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--border-strong)" />

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

        {nodes.length === 0 && (
          <Panel position="top-center" className="svn-empty-overlay">
            <h2 className="svn-empty-overlay__title">Start building your Savanna</h2>
            <p className="svn-empty-overlay__body">
              Add notes, write and draw directly, then open any note with embedded Tiptap editing.
            </p>
            <div className="svn-empty-overlay__actions">
              <button type="button" className="svn-empty-overlay__btn" onClick={() => setNotePanelOpen(true)}>
                <span className="material-symbols-outlined">sticky_note_2</span>
                Add notes
              </button>
              <button type="button" className="svn-empty-overlay__btn" onClick={addTextBlock}>
                <span className="material-symbols-outlined">edit_note</span>
                Add text
              </button>
              <button type="button" className="svn-empty-overlay__btn" onClick={addDrawPad}>
                <span className="material-symbols-outlined">draw</span>
                Add draw pad
              </button>
              <button type="button" className="svn-empty-overlay__btn" onClick={addLabel}>
                <span className="material-symbols-outlined">label</span>
                Add label
              </button>
              <button type="button" className="svn-empty-overlay__btn" onClick={addZone}>
                <span className="material-symbols-outlined">crop_square</span>
                Add zone
              </button>
            </div>
          </Panel>
        )}
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
