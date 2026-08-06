import { isRecord } from "@giraffle/domain";

export const TM_NOTE_DRAG = "tm:note" as const;
export const TM_TODO_DRAG = "tm:todo" as const;

export type TmNoteDragData = { type: typeof TM_NOTE_DRAG; id: string };
export type TmTodoDragData = { type: typeof TM_TODO_DRAG; id: string };

export const tmNoteDragData = (id: string): TmNoteDragData => ({
  type: TM_NOTE_DRAG,
  id,
});

export const tmTodoDragData = (id: string): TmTodoDragData => ({
  type: TM_TODO_DRAG,
  id,
});

export function isTmNoteDragData(d: unknown): d is TmNoteDragData {
  return isRecord(d) && d.type === TM_NOTE_DRAG && typeof d.id === "string";
}

export function isTmTodoDragData(d: unknown): d is TmTodoDragData {
  return isRecord(d) && d.type === TM_TODO_DRAG && typeof d.id === "string";
}
