import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A block that steps out of the flow to say something aside from it: a warning,
 * a definition, the thing you will forget. It holds blocks rather than text, so
 * a callout can carry a list or a heading the way any other container can.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      emoji: {
        default: "💡",
        parseHTML: (element) => element.getAttribute("data-emoji") ?? "💡",
        renderHTML: (attributes) => ({ "data-emoji": String(attributes.emoji ?? "💡") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "giraffle-callout" }),
      // The emoji is an attribute, not content, so it is drawn rather than
      // edited — a person changes it by pressing it, not by selecting it.
      ["div", { class: "giraffle-callout-mark", contenteditable: "false" }, String(HTMLAttributes["data-emoji"] ?? "💡")],
      ["div", { class: "giraffle-callout-body" }, 0],
    ];
  },
});
