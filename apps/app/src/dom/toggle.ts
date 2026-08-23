import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * A toggle is a line you can fold the rest of a section behind. It is three
 * nodes rather than one because the summary and the body are edited
 * separately: the caret has to be able to sit in either without the other
 * disappearing, and Enter in the summary has to open the body rather than
 * split the block.
 */
export const ToggleSummary = Node.create({
  name: "toggleSummary",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-summary"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle-summary",
        class: "giraffle-toggle-summary",
      }),
      0,
    ];
  },
});

export const ToggleBody = Node.create({
  name: "toggleBody",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "toggle-body", class: "giraffle-toggle-body" }),
      0,
    ];
  },
});

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "toggleSummary toggleBody",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-open") !== "false",
        renderHTML: (attributes) => ({ "data-open": attributes.open === false ? "false" : "true" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "toggle", class: "giraffle-toggle" }),
      // The triangle is chrome, not text: it never takes the caret, and it is
      // the one place a click changes whether the body is shown.
      ["button", { class: "giraffle-toggle-mark", contenteditable: "false", type: "button" }, "▸"],
      ["div", { class: "giraffle-toggle-content" }, 0],
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("giraffleToggleMark"),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target;
              if (!(target instanceof globalThis.HTMLElement)) return false;
              if (!target.classList.contains("giraffle-toggle-mark")) return false;

              const wrapper = target.closest('div[data-type="toggle"]');
              if (!wrapper) return false;
              const position = view.posAtDOM(wrapper, 0);
              const resolved = view.state.doc.resolve(position);
              // posAtDOM lands inside the summary, so the toggle itself is the
              // ancestor that carries the attribute.
              for (let depth = resolved.depth; depth >= 0; depth -= 1) {
                const node = resolved.node(depth);
                if (node.type.name !== "toggle") continue;
                const at = resolved.before(depth);
                event.preventDefault();
                view.dispatch(
                  view.state.tr.setNodeAttribute(at, "open", node.attrs.open === false),
                );
                return true;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
