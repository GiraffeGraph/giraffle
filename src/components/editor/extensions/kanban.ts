import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { KanbanBoardComponent } from "../components/KanbanBoardComponent";
import {
  createDefaultKanbanColumns,
  normalizeKanbanColumns,
  type KanbanColumn,
} from "./kanban.shared";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kanban: {
      insertKanban: (attributes?: {
        title?: string;
        columns?: KanbanColumn[];
      }) => ReturnType;
    };
  }
}

export const KanbanNode = Node.create({
  name: "kanban",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: "Sprint Board",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-title") || "Sprint Board",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-title":
            typeof attributes.title === "string"
              ? attributes.title
              : "Sprint Board",
        }),
      },
      columns: {
        default: createDefaultKanbanColumns(),
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-columns");

          if (!raw) {
            return createDefaultKanbanColumns();
          }

          try {
            return normalizeKanbanColumns(JSON.parse(raw));
          } catch {
            return createDefaultKanbanColumns();
          }
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-columns": JSON.stringify(
            normalizeKanbanColumns(attributes.columns)
          ),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="kanban"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "kanban",
        class: "giraffle-kanban-node",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KanbanBoardComponent);
  },

  addCommands() {
    return {
      insertKanban:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attributes.title ?? "Sprint Board",
              columns: normalizeKanbanColumns(
                attributes.columns ?? createDefaultKanbanColumns()
              ),
            },
          }),
    };
  },
});
