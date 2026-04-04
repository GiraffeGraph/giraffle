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
    title: "Metin",
    description: "Düz metin bloğu",
    icon: "TXT",
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Başlık 1",
    description: "Büyük bölüm başlığı",
    icon: "H1",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: "Başlık 2",
    description: "Orta bölüm başlığı",
    icon: "H2",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: "Başlık 3",
    description: "Küçük bölüm başlığı",
    icon: "H3",
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: "Madde Listesi",
    description: "Sırasız liste",
    icon: "UL",
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Numaralı Liste",
    description: "Sıralı liste",
    icon: "1.",
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: "Kod Bloğu",
    description: "Kod parçası",
    icon: "</>",
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    title: "Alıntı",
    description: "Alıntı bloğu",
    icon: "QT",
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    title: "Ayraç",
    description: "Yatay çizgi",
    icon: "---",
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    title: "Vurgu Kutusu",
    description: "Öne çıkan not bloğu",
    icon: "!",
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
          : window.prompt("Vurgu başlığı", "Önemli nokta")?.trim() || "Vurgu";

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
    title: "Açılır Blok",
    description: "Açılıp kapanan iç içe blok",
    icon: "+/-",
    command: (editor) => {
      const summary =
        typeof window === "undefined"
          ? "Açılır Blok"
          : window.prompt("Açılır blok özeti", "Ayrıntılar")?.trim() ||
            "Açılır Blok";

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
    title: "Görsel",
    description: "URL ile görsel ekle",
    icon: "IMG",
    command: (editor) => {
      const src =
        typeof window === "undefined"
          ? ""
          : window.prompt("Görsel URL'si", "https://")?.trim() || "";

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
    title: "Tablo İskeleti",
    description: "Zengin tablo gelene kadar Markdown tablo ekle",
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
              text: "| Sütun 1 | Sütun 2 |\n| --- | --- |\n| Değer | Değer |",
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
