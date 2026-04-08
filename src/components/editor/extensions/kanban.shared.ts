import { generateId } from "@/lib/utils";

export const KANBAN_COLUMN_TONES = [
  "accent",
  "warm",
  "sky",
  "rose",
  "emerald",
] as const;

export type KanbanColumnTone = (typeof KANBAN_COLUMN_TONES)[number];

export interface KanbanCard {
  id: string;
  title: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tone: KanbanColumnTone;
  cards: KanbanCard[];
}

export function createKanbanCard(title = ""): KanbanCard {
  return {
    id: generateId(),
    title,
  };
}

export function createKanbanColumn(
  title: string,
  tone: KanbanColumnTone,
  cards: KanbanCard[] = []
): KanbanColumn {
  return {
    id: generateId(),
    title,
    tone,
    cards,
  };
}

export function createDefaultKanbanColumns(): KanbanColumn[] {
  return [
    createKanbanColumn("Yapilacak", "accent", [createKanbanCard("Yeni gorev")]),
    createKanbanColumn("Yapiliyor", "sky"),
    createKanbanColumn("Yapildi", "emerald"),
  ];
}

export function normalizeKanbanColumns(value: unknown): KanbanColumn[] {
  if (!Array.isArray(value)) {
    return createDefaultKanbanColumns();
  }

  const normalized = value
    .filter((column): column is Record<string, unknown> => isRecord(column))
    .map((column, index) => {
      const cardsSource = Array.isArray(column.cards) ? column.cards : [];

      return {
        id:
          typeof column.id === "string" && column.id.trim().length > 0
            ? column.id
            : generateId(),
        title:
          typeof column.title === "string" && column.title.trim().length > 0
            ? column.title
            : `Kolon ${index + 1}`,
        tone: normalizeKanbanTone(column.tone, index),
        cards: cardsSource
          .filter((card): card is Record<string, unknown> => isRecord(card))
          .map((card) => ({
            id:
              typeof card.id === "string" && card.id.trim().length > 0
                ? card.id
                : generateId(),
            title: typeof card.title === "string" ? card.title : "",
          })),
      } satisfies KanbanColumn;
    });

  return normalized.length > 0 ? normalized : createDefaultKanbanColumns();
}

export function getNextKanbanTone(index: number): KanbanColumnTone {
  return KANBAN_COLUMN_TONES[index % KANBAN_COLUMN_TONES.length];
}

export function moveKanbanCard(
  columns: KanbanColumn[],
  sourceColumnId: string,
  cardId: string,
  targetColumnId: string,
  targetIndex: number
): KanbanColumn[] {
  const nextColumns = normalizeKanbanColumns(columns).map((column) => ({
    ...column,
    cards: [...column.cards],
  }));

  const sourceColumn = nextColumns.find((column) => column.id === sourceColumnId);
  const targetColumn = nextColumns.find((column) => column.id === targetColumnId);

  if (!sourceColumn || !targetColumn) {
    return nextColumns;
  }

  const sourceCardIndex = sourceColumn.cards.findIndex((card) => card.id === cardId);

  if (sourceCardIndex === -1) {
    return nextColumns;
  }

  const [movedCard] = sourceColumn.cards.splice(sourceCardIndex, 1);

  if (!movedCard) {
    return nextColumns;
  }

  let nextTargetIndex = Math.max(0, Math.min(targetIndex, targetColumn.cards.length));

  if (sourceColumn.id === targetColumn.id && sourceCardIndex < nextTargetIndex) {
    nextTargetIndex -= 1;
  }

  targetColumn.cards.splice(nextTargetIndex, 0, movedCard);

  return nextColumns;
}

export function moveKanbanColumn(
  columns: KanbanColumn[],
  sourceColumnId: string,
  targetIndex: number
): KanbanColumn[] {
  const nextColumns = normalizeKanbanColumns(columns).map((column) => ({
    ...column,
    cards: [...column.cards],
  }));

  const sourceIndex = nextColumns.findIndex(
    (column) => column.id === sourceColumnId
  );

  if (sourceIndex === -1) {
    return nextColumns;
  }

  const [movedColumn] = nextColumns.splice(sourceIndex, 1);

  if (!movedColumn) {
    return nextColumns;
  }

  let nextTargetIndex = Math.max(0, Math.min(targetIndex, nextColumns.length));

  if (sourceIndex < nextTargetIndex) {
    nextTargetIndex -= 1;
  }

  nextColumns.splice(nextTargetIndex, 0, movedColumn);

  return nextColumns;
}

function normalizeKanbanTone(
  value: unknown,
  index: number
): KanbanColumnTone {
  if (
    typeof value === "string" &&
    KANBAN_COLUMN_TONES.includes(value as KanbanColumnTone)
  ) {
    return value as KanbanColumnTone;
  }

  return getNextKanbanTone(index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
