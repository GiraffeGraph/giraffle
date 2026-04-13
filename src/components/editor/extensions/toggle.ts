import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggleBlock: {
      insertToggle: (attributes?: { summary?: string }) => ReturnType;
    };
  }
}

export const ToggleNode = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      summary: {
        default: "Toggle section",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-type="toggle"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const summary =
      typeof HTMLAttributes.summary === "string"
        ? HTMLAttributes.summary
        : "Toggle section";

    return [
      "details",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle",
        "data-summary": summary,
        class: "giraffle-toggle",
        open: "open",
      }),
      ["summary", { class: "giraffle-toggle-summary" }, summary],
      ["div", { class: "giraffle-toggle-body" }, 0],
    ];
  },

  addCommands() {
    return {
      insertToggle:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              summary: attributes.summary ?? "Toggle section",
            },
            content: [
              {
                type: "paragraph",
              },
            ],
          }),
    };
  },
});
