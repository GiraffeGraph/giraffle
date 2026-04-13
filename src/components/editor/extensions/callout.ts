import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (attributes?: {
        tone?: string;
        title?: string;
      }) => ReturnType;
    };
  }
}

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      tone: {
        default: "info",
      },
      title: {
        default: "Callout",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const tone =
      typeof HTMLAttributes.tone === "string" ? HTMLAttributes.tone : "info";
    const title =
      typeof HTMLAttributes.title === "string"
        ? HTMLAttributes.title
        : "Callout";

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        "data-tone": tone,
        class: `giraffle-callout giraffle-callout-${tone}`,
      }),
      ["div", { class: "giraffle-callout-header" }, title],
      ["div", { class: "giraffle-callout-body" }, 0],
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              tone: attributes.tone ?? "info",
              title: attributes.title ?? "Callout",
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
