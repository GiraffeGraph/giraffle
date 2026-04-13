"use client";

import dynamic from "next/dynamic";
import React, { type ReactNode, useState } from "react";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";

const DynamicEditor = dynamic(
  () => import("./Editor").then((module) => module.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="editor-loading">
        <div className="editor-loading-skeleton" />
        <div className="editor-loading-skeleton short" />
        <div className="editor-loading-skeleton" />
      </div>
    ),
  },
);

interface SafeEditorProps {
  noteId?: string;
  initialContent?: TiptapDocument;
  onSave?: (content: TiptapDocument) => void;
  editable?: boolean;
  searchWikilinkNotes?: (query: string) => Promise<NoteReference[]>;
  resolveWikilinkNote?: (target: string) => Promise<NoteReference | null>;
  createWikilinkNote?: (target: string) => Promise<NoteReference>;
  onNavigateToNote?: (noteId: string) => void;
}

interface BoundaryProps {
  children: ReactNode;
  onRetry: () => void;
  initialContent?: TiptapDocument;
}

interface BoundaryState {
  error: Error | null;
}

class EditorErrorBoundary extends React.Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[SafeEditor] editor render failed", error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          border: "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: 12,
          padding: 14,
          background: "var(--md-sys-color-surface-container)",
          display: "grid",
          gap: 10,
        }}
      >
        <strong style={{ fontSize: 14 }}>Editor failed to load</strong>
        <span
          style={{
            fontSize: 12,
            color: "var(--md-sys-color-on-surface-variant)",
          }}
        >
          The note opened, but the advanced editor failed on this device.
        </span>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
          style={{
            justifySelf: "start",
            border: "1px solid var(--md-sys-color-outline)",
            borderRadius: 999,
            padding: "6px 12px",
            background: "var(--md-sys-color-primary)",
            color: "var(--md-sys-color-on-primary)",
            cursor: "pointer",
          }}
        >
          Retry editor
        </button>
        <pre
          style={{
            margin: 0,
            maxHeight: 240,
            overflow: "auto",
            fontSize: 11,
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            borderTop: "1px solid var(--md-sys-color-outline-variant)",
            paddingTop: 8,
            color: "var(--md-sys-color-on-surface-variant)",
          }}
        >
          {extractText(this.props.initialContent)}
        </pre>
      </div>
    );
  }
}

export function SafeEditor(props: SafeEditorProps) {
  const [retrySeed, setRetrySeed] = useState(0);

  return (
    <EditorErrorBoundary
      onRetry={() => setRetrySeed((value) => value + 1)}
      initialContent={props.initialContent}
    >
      <DynamicEditor key={retrySeed} {...props} />
    </EditorErrorBoundary>
  );
}

function extractText(document: TiptapDocument | undefined): string {
  if (!document || typeof document !== "object") return "";

  const walk = (node: unknown): string[] => {
    if (!node || typeof node !== "object") return [];
    const candidate = node as {
      text?: unknown;
      content?: unknown;
      attrs?: { label?: unknown };
    };

    const parts: string[] = [];

    if (typeof candidate.text === "string") {
      parts.push(candidate.text);
    }

    if (candidate.attrs && typeof candidate.attrs.label === "string") {
      parts.push(candidate.attrs.label);
    }

    if (Array.isArray(candidate.content)) {
      for (const child of candidate.content) {
        parts.push(...walk(child));
      }
    }

    return parts;
  };

  return walk(document).join(" ").trim() || "(Empty content)";
}
