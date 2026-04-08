import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { generateId } from "@/lib/utils";

const BLOCK_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "blockquote",
  "callout",
  "toggle",
  "kanban",
  "image",
  "horizontalRule",
  "table",
  "taskList",
  "taskItem",
] as const;

export const BlockIdExtension = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_NODE_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-block-id"),
            renderHTML: (attributes: Record<string, unknown>) => {
              if (typeof attributes.blockId !== "string") {
                return {};
              }

              return {
                "data-block-id": attributes.blockId,
              };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockId"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          let transaction = newState.tr;
          let hasChanges = false;
          const seenBlockIds = new Set<string>();

          newState.doc.descendants((node, position) => {
            if (!BLOCK_NODE_TYPES.includes(node.type.name as (typeof BLOCK_NODE_TYPES)[number])) {
              return;
            }

            const existingBlockId =
              typeof node.attrs.blockId === "string" &&
              node.attrs.blockId.trim().length > 0
                ? node.attrs.blockId
                : null;
            const shouldGenerate =
              existingBlockId === null || seenBlockIds.has(existingBlockId);

            if (existingBlockId && !shouldGenerate) {
              seenBlockIds.add(existingBlockId);
              return;
            }

            let nextBlockId = generateId();

            while (seenBlockIds.has(nextBlockId)) {
              nextBlockId = generateId();
            }

            seenBlockIds.add(nextBlockId);
            transaction = transaction.setNodeMarkup(
              position,
              undefined,
              {
                ...node.attrs,
                blockId: nextBlockId,
              },
              node.marks
            );
            hasChanges = true;
          });

          return hasChanges ? transaction : null;
        },
      }),
    ];
  },
});
