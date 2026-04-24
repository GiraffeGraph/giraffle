import type { Editor } from "@tiptap/core";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  shortcut?: string;
  command: (editor: Editor) => void;
}

export const defaultSlashCommands: SlashCommandItem[] = [
  {
    title: "Spotter",
    description: "Get Spotter help inside the note",
    icon: "✨",
    shortcut: "/spotter",
    command: (editor) => {
      editor.chain().focus().insertSpotterBlock().run();
    },
  },
  {
    title: "Text",
    description: "Plain text block",
    icon: "TXT",
    shortcut: "/text",
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    shortcut: "/h1",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    shortcut: "/h2",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    shortcut: "/h3",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "UL",
    shortcut: "/ul",
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    shortcut: "/ol",
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: "Code Block",
    description: "Code snippet",
    icon: "</>",
    shortcut: "/code",
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    title: "Quote",
    description: "Quote block",
    icon: "QT",
    shortcut: "/quote",
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: "---",
    shortcut: "/hr",
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    title: "Callout",
    description: "Highlighted note block",
    icon: "!",
    shortcut: "/callout",
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "callout",
          attrs: {
            tone: "info",
            title: "Info",
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
    title: "Toggle Block",
    description: "Collapsible nested block",
    icon: "+/-",
    shortcut: "/toggle",
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "toggle",
          attrs: {
            summary: "Details",
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
    description: "Insert an image by URL",
    icon: "IMG",
    shortcut: "/image",
    command: (editor) => {
      const src =
        typeof window === "undefined"
          ? ""
          : window.prompt("Image URL", "https://")?.trim() || "";

      if (!src) {
        return;
      }

      editor.chain().focus().setImage({ src, alt: "" }).run();
    },
  },
  {
    title: "Table",
    description: "Insert an editable table",
    icon: "TB",
    shortcut: "/table",
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: "To-do List",
    description: "Checklist block",
    icon: "☑",
    shortcut: "/todo",
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: {
                checked: false,
              },
              content: [
                {
                  type: "paragraph",
                },
              ],
            },
          ],
        })
        .run();
    },
  },
  {
    title: "Kanban",
    description: "Draggable task board",
    icon: "KB",
    shortcut: "/kanban",
    command: (editor) => {
      editor.chain().focus().insertKanban().run();
    },
  },
];
