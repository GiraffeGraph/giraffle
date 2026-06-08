import { isRecord } from "@/lib/utils";

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
