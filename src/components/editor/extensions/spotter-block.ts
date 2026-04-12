import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SpotterBlockComponent } from "../components/SpotterBlockComponent";

export interface SpotterBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spotterBlock: {
      insertSpotterBlock: () => ReturnType;
    };
  }
}

export const SpotterBlockNode = Node.create<SpotterBlockOptions>({
  name: "agentBlock",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      status: {
        default: "idle",
      },
      prompt: {
        default: "",
      },
      output: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="spotter-block"]',
      },
      {
        tag: 'div[data-type="agent-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "spotter-block",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpotterBlockComponent);
  },

  addCommands() {
    return {
      insertSpotterBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
          }),
    };
  },
});
