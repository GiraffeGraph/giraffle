import type { NoteReference } from "@/domain/note/note.types";

export interface SlashMenuState {
  query: string;
  range: { from: number; to: number };
  position: { top: number; left: number };
}

export interface WikilinkMenuState {
  query: string;
  target: string;
  range: { from: number; to: number };
  position: { top: number; left: number };
}

export interface WikilinkMenuItem {
  title: string;
  description: string;
  icon: string;
  menuKey?: string;
  note?: NoteReference;
  createTarget?: string;
}

export interface BlockToolbarState {
  blockId: string;
  position: { top: number; left: number };
}

export interface BlockDropIndicatorState {
  top: number;
  left: number;
  width: number;
  targetBlockId: string;
  mode: "before" | "after";
}
