import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  command: (editor: Editor) => void;
}

export const defaultSlashCommands: SlashCommandItem[] = [
  {
    title: "Text",
    description: "Plain text block",
    icon: "TXT",
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "UL",
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: "Code Block",
    description: "Code snippet",
    icon: "</>",
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    title: "Quote",
    description: "Blockquote",
    icon: "QT",
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: "---",
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    title: "Callout",
    description: "Highlighted note block",
    icon: "!",
    command: (editor) => {
      const tone =
        typeof window === "undefined"
          ? "info"
          : window
              .prompt("Callout tone (info, tip, warning, danger)", "info")
              ?.trim()
              .toLowerCase() || "info";
      const title =
        typeof window === "undefined"
          ? "Callout"
          : window.prompt("Callout title", "Key takeaway")?.trim() ||
            "Callout";

      editor
        .chain()
        .focus()
        .insertContent({
          type: "callout",
          attrs: {
            tone,
            title,
          },
          content: [
            {
              type: "paragraph",
            },
          ],
        })
        .run();
    },
  },
  {
    title: "Toggle",
    description: "Collapsible nested block",
    icon: "+/-",
    command: (editor) => {
      const summary =
        typeof window === "undefined"
          ? "Toggle"
          : window.prompt("Toggle summary", "Details")?.trim() || "Toggle";

      editor
        .chain()
        .focus()
        .insertContent({
          type: "toggle",
          attrs: {
            summary,
          },
          content: [
            {
              type: "paragraph",
            },
          ],
        })
        .run();
    },
  },
  {
    title: "Image",
    description: "Embed an image by URL",
    icon: "IMG",
    command: (editor) => {
      const src =
        typeof window === "undefined"
          ? ""
          : window.prompt("Image URL", "https://")?.trim() || "";

      if (!src) {
        return;
      }

      const alt =
        typeof window === "undefined"
          ? ""
          : window.prompt("Alt text", "")?.trim() || "";

      editor.chain().focus().setImage({ src, alt }).run();
    },
  },
  {
    title: "Table Scaffold",
    description: "Insert Markdown table content while rich tables are deferred",
    icon: "TB",
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "codeBlock",
          attrs: {
            language: "md",
          },
          content: [
            {
              type: "text",
              text: "| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |",
            },
          ],
        })
        .run();
    },
  },
];

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: new PluginKey("slashCommand"),
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: { from: number; to: number };
          props: SlashCommandItem;
        }) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },
        items: ({ query }: { query: string }) => {
          return defaultSlashCommands.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          );
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
