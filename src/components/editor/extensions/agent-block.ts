import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { AgentBlockComponent } from "../components/AgentBlockComponent";

export interface AgentBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    agentBlock: {
      insertAgentBlock: () => ReturnType;
    };
  }
}

export const AgentBlockNode = Node.create<AgentBlockOptions>({
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
        tag: 'div[data-type="agent-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "agent-block",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AgentBlockComponent);
  },

  addCommands() {
    return {
      insertAgentBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
          }),
    };
  },
});
