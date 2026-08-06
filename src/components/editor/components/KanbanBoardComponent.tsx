"use client";

import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateId, isRecord } from "@giraffle/domain";
import type { KanbanCard, KanbanColumn } from "../extensions/kanban.shared";
import {
  createKanbanCard,
  createKanbanColumn,
  getNextKanbanTone,
  moveKanbanCard,
  moveKanbanColumn,
  normalizeKanbanColumns,
} from "../extensions/kanban.shared";

interface CardDragState {
  columnId: string;
  cardId: string;
}

interface CardDropMarker {
  columnId: string;
  index: number;
}

interface ColumnDragState {
  columnId: string;
}

interface ColumnDropMarker {
  index: number;
}

interface KanbanCardDragData {
  type: "kanban-card";
  columnId: string;
  cardId: string;
}

interface KanbanColumnDragData {
  type: "kanban-column";
  columnId: string;
}

interface KanbanCardDropData {
  type: "kanban-card-drop-target";
  columnId: string;
  index: number;
}

interface KanbanColumnDropData {
  type: "kanban-column-drop-target";
  index: number;
}

export function KanbanBoardComponent({ node, updateAttributes }: NodeViewProps) {
  const columns = useMemo(
    () => normalizeKanbanColumns(node.attrs.columns),
    [node.attrs.columns]
  );
  const boardTitle =
    typeof node.attrs.title === "string" && node.attrs.title.trim().length > 0
      ? node.attrs.title
      : "Sprint Board";
  const [cardDragState, setCardDragState] = useState<CardDragState | null>(null);
  const [cardDropMarker, setCardDropMarker] = useState<CardDropMarker | null>(
    null
  );
  const [columnDragState, setColumnDragState] =
    useState<ColumnDragState | null>(null);
  const [columnDropMarker, setColumnDropMarker] =
    useState<ColumnDropMarker | null>(null);

  const columnElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnHandleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cardElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardHandleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cardDropZoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnDropZoneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const updateColumns = useCallback(
    (nextColumns: KanbanColumn[]) => {
      updateAttributes({
        columns: nextColumns,
      });
    },
    [updateAttributes]
  );

  const handleBoardTitleChange = (title: string) => {
    updateAttributes({
      title,
    });
  };

  const handleColumnTitleChange = (columnId: string, title: string) => {
    updateColumns(
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              title,
            }
          : column
      )
    );
  };

  const handleAddColumn = () => {
    updateColumns([
      ...columns,
      createKanbanColumn(
        `Column ${columns.length + 1}`,
        getNextKanbanTone(columns.length)
      ),
    ]);
  };

  const handleRemoveColumn = (columnId: string) => {
    if (columns.length <= 1) {
      return;
    }

    updateColumns(columns.filter((column) => column.id !== columnId));
  };

  const handleAddCard = (columnId: string) => {
    updateColumns(
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [...column.cards, createKanbanCard("")],
            }
          : column
      )
    );
  };

  const handleCardTitleChange = (
    columnId: string,
    cardId: string,
    title: string
  ) => {
    updateColumns(
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.map((card) =>
                card.id === cardId
                  ? {
                      ...card,
                      title,
                    }
                  : card
              ),
            }
          : column
      )
    );
  };

  const handleRemoveCard = (columnId: string, cardId: string) => {
    updateColumns(
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.filter((card) => card.id !== cardId),
            }
          : column
      )
    );
  };

  const handleDuplicateCard = (columnId: string, card: KanbanCard) => {
    updateColumns(
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [
                ...column.cards,
                {
                  id: generateId(),
                  title: card.title,
                },
              ],
            }
          : column
      )
    );
  };

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    for (const [columnIndex, column] of columns.entries()) {
      const columnElement = columnElementRefs.current[column.id];
      const columnHandle = columnHandleRefs.current[column.id];

      if (columnElement && columnHandle) {
        cleanups.push(
          draggable({
            element: columnElement,
            dragHandle: columnHandle,
            getInitialData: () => ({
              type: "kanban-column",
              columnId: column.id,
            }),
          })
        );
      }

      const columnDropZone = columnDropZoneRefs.current[
        getColumnDropZoneKey(columnIndex)
      ];

      if (columnDropZone) {
        cleanups.push(
          dropTargetForElements({
            element: columnDropZone,
            canDrop: ({ source }) => isKanbanColumnDragData(source.data),
            getData: () => ({
              type: "kanban-column-drop-target",
              index: columnIndex,
            }),
          })
        );
      }

      for (const [cardIndex, card] of column.cards.entries()) {
        const cardElement = cardElementRefs.current[card.id];
        const cardHandle = cardHandleRefs.current[card.id];

        if (cardElement && cardHandle) {
          cleanups.push(
            draggable({
              element: cardElement,
              dragHandle: cardHandle,
              getInitialData: () => ({
                type: "kanban-card",
                columnId: column.id,
                cardId: card.id,
              }),
            })
          );
        }

        const cardDropZone = cardDropZoneRefs.current[
          getCardDropZoneKey(column.id, cardIndex)
        ];

        if (cardDropZone) {
          cleanups.push(
            dropTargetForElements({
              element: cardDropZone,
              canDrop: ({ source }) => isKanbanCardDragData(source.data),
              getData: () => ({
                type: "kanban-card-drop-target",
                columnId: column.id,
                index: cardIndex,
              }),
            })
          );
        }
      }

      const trailingCardDropZone = cardDropZoneRefs.current[
        getCardDropZoneKey(column.id, column.cards.length)
      ];

      if (trailingCardDropZone) {
        cleanups.push(
          dropTargetForElements({
            element: trailingCardDropZone,
            canDrop: ({ source }) => isKanbanCardDragData(source.data),
            getData: () => ({
              type: "kanban-card-drop-target",
              columnId: column.id,
              index: column.cards.length,
            }),
          })
        );
      }
    }

    const trailingColumnDropZone = columnDropZoneRefs.current[
      getColumnDropZoneKey(columns.length)
    ];

    if (trailingColumnDropZone) {
      cleanups.push(
        dropTargetForElements({
          element: trailingColumnDropZone,
          canDrop: ({ source }) => isKanbanColumnDragData(source.data),
          getData: () => ({
            type: "kanban-column-drop-target",
            index: columns.length,
          }),
        })
      );
    }

    cleanups.push(
      monitorForElements({
        canMonitor: ({ source }) => isKanbanCardDragData(source.data),
        onDragStart: ({ source }) => {
          if (!isKanbanCardDragData(source.data)) {
            return;
          }

          setColumnDragState(null);
          setColumnDropMarker(null);
          setCardDragState({
            columnId: source.data.columnId,
            cardId: source.data.cardId,
          });
        },
        onDropTargetChange: ({ location }) => {
          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isKanbanCardDropData(currentTarget)) {
            setCardDropMarker(null);
            return;
          }

          setCardDropMarker({
            columnId: currentTarget.columnId,
            index: currentTarget.index,
          });
        },
        onDrop: ({ source, location }) => {
          setCardDragState(null);
          setCardDropMarker(null);

          if (!isKanbanCardDragData(source.data)) {
            return;
          }

          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isKanbanCardDropData(currentTarget)) {
            return;
          }

          updateColumns(
            moveKanbanCard(
              columns,
              source.data.columnId,
              source.data.cardId,
              currentTarget.columnId,
              currentTarget.index
            )
          );
        },
      })
    );

    cleanups.push(
      monitorForElements({
        canMonitor: ({ source }) => isKanbanColumnDragData(source.data),
        onDragStart: ({ source }) => {
          if (!isKanbanColumnDragData(source.data)) {
            return;
          }

          setCardDragState(null);
          setCardDropMarker(null);
          setColumnDragState({
            columnId: source.data.columnId,
          });
        },
        onDropTargetChange: ({ location }) => {
          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isKanbanColumnDropData(currentTarget)) {
            setColumnDropMarker(null);
            return;
          }

          setColumnDropMarker({
            index: currentTarget.index,
          });
        },
        onDrop: ({ source, location }) => {
          setColumnDragState(null);
          setColumnDropMarker(null);

          if (!isKanbanColumnDragData(source.data)) {
            return;
          }

          const currentTarget = location.current.dropTargets[0]?.data;

          if (!isKanbanColumnDropData(currentTarget)) {
            return;
          }

          updateColumns(
            moveKanbanColumn(columns, source.data.columnId, currentTarget.index)
          );
        },
      })
    );

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [columns, updateColumns]);

  return (
    <NodeViewWrapper className="giraffle-kanban-board" contentEditable={false}>
      <div className="giraffle-kanban-shell">
        <div className="giraffle-kanban-header">
          <input
            className="giraffle-kanban-title-input"
            value={boardTitle}
            onChange={(event) => handleBoardTitleChange(event.target.value)}
            placeholder="Sprint Board"
            draggable={false}
          />
        </div>

        <div className="giraffle-kanban-columns">
          <DropZone
            orientation="column"
            active={columnDropMarker?.index === 0}
            registerRef={(element) => {
              columnDropZoneRefs.current[getColumnDropZoneKey(0)] = element;
            }}
          />

          {columns.map((column, columnIndex) => (
            <div className="giraffle-kanban-column-slot" key={column.id}>
              <div
                ref={(element) => {
                  columnElementRefs.current[column.id] = element;
                }}
                className={`giraffle-kanban-column${
                  columnDragState?.columnId === column.id ? " is-dragging" : ""
                }`}
                data-tone={column.tone}
              >
                <div className="giraffle-kanban-column-header">
                  <div className="giraffle-kanban-column-heading">
                    <button
                      ref={(element) => {
                        columnHandleRefs.current[column.id] = element;
                      }}
                      type="button"
                      className="giraffle-kanban-column-grip"
                      title="Drag column"
                      aria-label="Drag column"
                    >
                      ::
                    </button>
                    <span className="giraffle-kanban-column-dot" />
                    <input
                      className="giraffle-kanban-column-input"
                      value={column.title}
                      onChange={(event) =>
                        handleColumnTitleChange(column.id, event.target.value)
                      }
                      placeholder="Column"
                      draggable={false}
                    />
                  </div>
                  <div className="giraffle-kanban-column-header-end">
                    <span className="giraffle-kanban-card-count">
                      {column.cards.length}
                    </span>
                    <button
                      type="button"
                      className="giraffle-kanban-column-remove"
                      onClick={() => handleRemoveColumn(column.id)}
                      disabled={columns.length <= 1}
                      title="Delete column"
                    >
                      x
                    </button>
                  </div>
                </div>

                <div className="giraffle-kanban-card-list">
                  {column.cards.map((card, cardIndex) => (
                    <div className="giraffle-kanban-card-slot" key={card.id}>
                      <DropZone
                        active={
                          cardDropMarker?.columnId === column.id &&
                          cardDropMarker.index === cardIndex
                        }
                        registerRef={(element) => {
                          cardDropZoneRefs.current[
                            getCardDropZoneKey(column.id, cardIndex)
                          ] = element;
                        }}
                      />

                      <div
                        ref={(element) => {
                          cardElementRefs.current[card.id] = element;
                        }}
                        className={`giraffle-kanban-card${
                          cardDragState?.cardId === card.id ? " is-dragging" : ""
                        }`}
                      >
                        <textarea
                          className="giraffle-kanban-card-input"
                          value={card.title}
                          onChange={(event) =>
                            handleCardTitleChange(
                              column.id,
                              card.id,
                              event.target.value
                            )
                          }
                          placeholder="Task card"
                          rows={Math.max(
                            2,
                            Math.min(6, card.title.split("\n").length)
                          )}
                          draggable={false}
                        />

                        <div className="giraffle-kanban-card-actions">
                          <button
                            ref={(element) => {
                              cardHandleRefs.current[card.id] = element;
                            }}
                            type="button"
                            className="giraffle-kanban-card-grip"
                            title="Drag card"
                            aria-label="Drag card"
                          >
                            ::
                          </button>
                          <div className="giraffle-kanban-card-action-group">
                            <button
                              type="button"
                              className="giraffle-kanban-card-action"
                              onClick={() => handleDuplicateCard(column.id, card)}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              className="giraffle-kanban-card-action danger"
                              onClick={() => handleRemoveCard(column.id, card.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <DropZone
                    active={
                      cardDropMarker?.columnId === column.id &&
                      cardDropMarker.index === column.cards.length
                    }
                    empty={column.cards.length === 0}
                    registerRef={(element) => {
                      cardDropZoneRefs.current[
                        getCardDropZoneKey(column.id, column.cards.length)
                      ] = element;
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="giraffle-kanban-add-card"
                  onClick={() => handleAddCard(column.id)}
                >
                  + Add card
                </button>
              </div>

              <DropZone
                orientation="column"
                active={columnDropMarker?.index === columnIndex + 1}
                registerRef={(element) => {
                  columnDropZoneRefs.current[
                    getColumnDropZoneKey(columnIndex + 1)
                  ] = element;
                }}
              />
            </div>
          ))}

          <button
            type="button"
            className="giraffle-kanban-add-column"
            onClick={handleAddColumn}
          >
            + Column
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

interface DropZoneProps {
  active: boolean;
  registerRef: (element: HTMLDivElement | null) => void;
  orientation?: "card" | "column";
  empty?: boolean;
}

function DropZone({
  active,
  registerRef,
  orientation = "card",
  empty,
}: DropZoneProps) {
  return (
    <div
      ref={registerRef}
      className={`giraffle-kanban-dropzone ${orientation}${
        active ? " active" : ""
      }${empty ? " empty" : ""}`}
    />
  );
}

function getCardDropZoneKey(columnId: string, index: number): string {
  return `${columnId}:${index}`;
}

function getColumnDropZoneKey(index: number): string {
  return `${index}`;
}

function isKanbanCardDragData(
  value: unknown
): value is KanbanCardDragData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value?.type === "kanban-card" &&
    typeof value.columnId === "string" &&
    typeof value.cardId === "string"
  );
}

function isKanbanColumnDragData(
  value: unknown
): value is KanbanColumnDragData {
  return isRecord(value) &&
    value.type === "kanban-column" &&
    typeof value.columnId === "string";
}

function isKanbanCardDropData(
  value: unknown
): value is KanbanCardDropData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value?.type === "kanban-card-drop-target" &&
    typeof value.columnId === "string" &&
    typeof value.index === "number"
  );
}

function isKanbanColumnDropData(
  value: unknown
): value is KanbanColumnDropData {
  return isRecord(value) &&
    value.type === "kanban-column-drop-target" &&
    typeof value.index === "number";
}

