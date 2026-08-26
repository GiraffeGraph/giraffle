import type { TiptapDocument } from "./document/document.types";

/** One recursive identity for all knowledge and planning content. */
export type Id = string;

export type PageStateFamily = "forever" | "open" | "done";
export type PagePriority = "do" | "schedule" | "delegate" | "eliminate";
export type ChildView = "list" | "category" | "priority";

export const DEFAULT_STATE_IDS: Record<PageStateFamily, Id> = {
  forever: "giraffle-state-forever",
  open: "giraffle-state-open",
  done: "giraffle-state-done",
};

export interface PageBreadcrumb {
  id: Id;
  title: string;
  icon: string | null;
}

/**
 * The universal recursive unit. A lightweight action and a long-lived note are
 * the same Page; state and optional planning fields change how lenses present it.
 */
export interface Page {
  id: Id;
  title: string;
  icon: string | null;
  parentId: Id | null;
  position: string;
  stateId: Id;
  categoryId: Id | null;
  priority: PagePriority | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
  /** Hex color used by calendar lenses and external calendar adapters. */
  calendarColor: string | null;
  description: string | null;
  childView: ChildView;
  isPinned: boolean;
  isArchived: boolean;
  document: TiptapDocument;
  createdAt: number;
  updatedAt: number;
}

/** Custom vocabulary with stable semantics for global planning lenses. */
export interface PageState {
  id: Id;
  title: string;
  family: PageStateFamily;
  color: string | null;
  icon: string | null;
  position: string;
  isDefault: boolean;
}

/** A grouping local to one parent's direct children; null parent means workspace root. */
export interface PageCategory {
  id: Id;
  parentId: Id | null;
  title: string;
  color: string | null;
  position: string;
  stateIdOnEnter: Id | null;
}

/** An Excalidraw scene element; customData points at one canonical Page. */
export interface CanvasElement {
  id: Id;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  customData?: {
    girafflePageId?: Id;
    giraffleManagedKey?: string;
    giraffleManagedKind?: "node" | "label" | "edge" | "edge-label";
    giraffleManagedPart?: "shape" | "text" | "line";
    giraffleManagedText?: string;
    giraffleManagedStyle?: string;
    giraffleManagedFrom?: string;
    giraffleManagedTo?: string;
    giraffleManagedLabel?: string;
  };
  [key: string]: unknown;
}

export interface Canvas {
  id: Id;
  title: string;
  elements: CanvasElement[];
  appState: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Backlink {
  sourcePageId: Id;
  sourceTitle: string;
  targetPageId: Id;
  targetRaw: string;
}

export const EMPTY_DOCUMENT: TiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph", attrs: { id: "root-paragraph" } }],
};
