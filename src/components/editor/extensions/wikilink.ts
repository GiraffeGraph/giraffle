import { Mark, mergeAttributes, markInputRule } from "@tiptap/core";

/**
 * Wikilink mark extension for Tiptap.
 * Renders [[Note Name]] as a styled clickable inline element.
 * Supports [[Target|Display Text]] syntax via input rule.
 */
export const WikilinkMark = Mark.create({
  name: "wikilink",

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-target"),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-target": attributes.target,
        }),
      },
      displayText: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-display"),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-display": attributes.displayText,
        }),
      },
      noteId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-note-id"),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-note-id": attributes.noteId,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wikilink"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wikilink",
        class: "wikilink",
        style:
          "color: var(--color-wikilink, #7c6ef0); cursor: pointer; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px;",
      }),
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]$/,
        type: this.type,
        getAttributes: (match: RegExpMatchArray) => ({
          target: match[1]?.trim(),
          displayText: match[2]?.trim() || match[1]?.trim(),
        }),
      }),
    ];
  },
});
