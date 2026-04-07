import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const ghostKey = new PluginKey("ghostHighlight");

export interface GhostHighlightItem {
  id: string;
  from: number;
  to: number;
  suggestion: string;
}

export const GhostHighlightPlugin = Extension.create({
  name: "ghostHighlightPlugin",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr: Transaction, set: DecorationSet) {
            // Adjust decoration positions mapping through document changes
            set = set.map(tr.mapping, tr.doc);

            // Handle custom tr.getMeta updates to add/remove highlights
            const action = tr.getMeta(ghostKey);
            if (action && action.type === "add") {
              const deco = Decoration.inline(
                action.from, 
                action.to, 
                {
                  class: "ghost-highlight",
                  "data-suggestion": action.suggestion,
                  title: action.suggestion, // Native tooltip for quick check
                }, 
                { id: action.id }
              );
              set = set.add(tr.doc, [deco]);
            } else if (action && action.type === "remove") {
              const decos = set.find(undefined, undefined, (spec) => spec.id === action.id);
              if (decos.length) {
                set = set.remove(decos);
              }
            } else if (action && action.type === "clear") {
              set = DecorationSet.empty;
            }

            return set;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      addGhostHighlight: 
        (options: { from: number; to: number; suggestion: string; id: string }) => 
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(ghostKey, { type: "add", ...options });
          }
          return true;
        },
      removeGhostHighlight: 
        (id: string) => 
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(ghostKey, { type: "remove", id });
          }
          return true;
        },
      clearGhostHighlights: 
        () => 
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(ghostKey, { type: "clear" });
          }
          return true;
        }
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghostHighlight: {
      addGhostHighlight: (options: { from: number; to: number; suggestion: string, id: string }) => ReturnType;
      removeGhostHighlight: (id: string) => ReturnType;
      clearGhostHighlights: () => ReturnType;
    };
  }
}
