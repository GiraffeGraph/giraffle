import { isRecord } from "@giraffle/domain";

export const KB_CARD_DRAG = "kb:card" as const;
export const KB_COLUMN_DRAG = "kb:column" as const;

export type KbCardDragData = {
  type: typeof KB_CARD_DRAG;
  cardId: string;
  fromColumnId: string;
};

export type KbColumnDragData = {
  type: typeof KB_COLUMN_DRAG;
  columnId: string;
};

export const kbCardDragData = (cardId: string, fromColumnId: string): KbCardDragData => ({
  type: KB_CARD_DRAG,
  cardId,
  fromColumnId,
});

export const kbColumnDragData = (columnId: string): KbColumnDragData => ({
  type: KB_COLUMN_DRAG,
  columnId,
});

export function isKbCardDragData(d: unknown): d is KbCardDragData {
  return (
    isRecord(d) &&
    d.type === KB_CARD_DRAG &&
    typeof d.cardId === "string" &&
    typeof d.fromColumnId === "string"
  );
}

export function isKbColumnDragData(d: unknown): d is KbColumnDragData {
  return isRecord(d) && d.type === KB_COLUMN_DRAG && typeof d.columnId === "string";
}

// ─── Board-of-boards (meta kanban) ────────────────────────────

export const KB_BOARD_DRAG = "kb:board" as const;
export const KB_STATUS_DRAG = "kb:status" as const;

export type KbBoardDragData = {
  type: typeof KB_BOARD_DRAG;
  boardId: string;
  fromStatusId: string;
};

export type KbStatusDragData = {
  type: typeof KB_STATUS_DRAG;
  statusId: string;
};

export const kbBoardDragData = (boardId: string, fromStatusId: string): KbBoardDragData => ({
  type: KB_BOARD_DRAG,
  boardId,
  fromStatusId,
});

export const kbStatusDragData = (statusId: string): KbStatusDragData => ({
  type: KB_STATUS_DRAG,
  statusId,
});

export function isKbBoardDragData(d: unknown): d is KbBoardDragData {
  return (
    isRecord(d) &&
    d.type === KB_BOARD_DRAG &&
    typeof d.boardId === "string" &&
    typeof d.fromStatusId === "string"
  );
}

export function isKbStatusDragData(d: unknown): d is KbStatusDragData {
  return isRecord(d) && d.type === KB_STATUS_DRAG && typeof d.statusId === "string";
}
