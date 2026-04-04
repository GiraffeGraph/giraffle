import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  shortcut?: string;
  command: (editor: Editor) => void;
}

export const defaultSlashCommands: SlashCommandItem[] = [
  {
    title: "Metin",
    description: "Duz metin blogu",
    icon: "TXT",
    shortcut: "/text",
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Baslik 1",
    description: "Buyuk bolum basligi",
    icon: "H1",
    shortcut: "/h1",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: "Baslik 2",
    description: "Orta bolum basligi",
    icon: "H2",
    shortcut: "/h2",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: "Baslik 3",
    description: "Kucuk bolum basligi",
    icon: "H3",
    shortcut: "/h3",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: "Madde Listesi",
    description: "Sirasiz liste",
    icon: "UL",
    shortcut: "/ul",
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Numarali Liste",
    description: "Sirali liste",
    icon: "1.",
    shortcut: "/ol",
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: "Kod Blogu",
    description: "Kod parcasi",
    icon: "</>",
    shortcut: "/code",
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    title: "Alinti",
    description: "Alinti blogu",
    icon: "QT",
    shortcut: "/quote",
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    title: "Ayrac",
    description: "Yatay cizgi",
    icon: "---",
    shortcut: "/hr",
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    title: "Vurgu Kutusu",
    description: "One cikan not blogu",
    icon: "!",
    shortcut: "/callout",
    command: (editor) => {
      const tone =
        typeof window === "undefined"
          ? "info"
          : window
              .prompt("Vurgu tonu (info, tip, warning, danger)", "info")
              ?.trim()
              .toLowerCase() || "info";
      const title =
        typeof window === "undefined"
          ? "Vurgu"
          : window.prompt("Vurgu basligi", "Onemli nokta")?.trim() || "Vurgu";

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
    title: "Acilir Blok",
    description: "Acilip kapanan ic ice blok",
    icon: "+/-",
    shortcut: "/toggle",
    command: (editor) => {
      const summary =
        typeof window === "undefined"
          ? "Acilir Blok"
          : window.prompt("Acilir blok ozeti", "Ayrintilar")?.trim() ||
            "Acilir Blok";

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
    title: "Gorsel",
    description: "URL ile gorsel ekle",
    icon: "IMG",
    shortcut: "/image",
    command: (editor) => {
      const src =
        typeof window === "undefined"
          ? ""
          : window.prompt("Gorsel URL'si", "https://")?.trim() || "";

      if (!src) {
        return;
      }

      const alt =
        typeof window === "undefined"
          ? ""
          : window.prompt("Alt metin", "")?.trim() || "";

      editor.chain().focus().setImage({ src, alt }).run();
    },
  },
  {
    title: "Tablo Iskeleti",
    description: "Zengin tablo gelene kadar Markdown tablo ekle",
    icon: "TB",
    shortcut: "/table",
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
              text: "| Sutun 1 | Sutun 2 |\n| --- | --- |\n| Deger | Deger |",
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
