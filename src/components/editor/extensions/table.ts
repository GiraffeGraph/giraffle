import { mergeAttributes, Node } from "@tiptap/core";

function sanitizeRows(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [
      ["Sütun 1", "Sütun 2"],
      ["Değer", "Değer"],
    ];
  }

  const rows = value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => String(cell ?? "")));

  return rows.length > 0
    ? rows
    : [
        ["Sütun 1", "Sütun 2"],
        ["Değer", "Değer"],
      ];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableBlock: {
      insertTableBlock: (attributes?: {
        rows?: string[][];
        caption?: string | null;
      }) => ReturnType;
    };
  }
}

export const TableBlockNode = Node.create({
  name: "table",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      rows: {
        default: [
          ["Sütun 1", "Sütun 2"],
          ["Değer", "Değer"],
        ],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-rows");

          if (!raw) {
            return undefined;
          }

          try {
            return sanitizeRows(JSON.parse(raw));
          } catch {
            return undefined;
          }
        },
      },
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-caption") || null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="table"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const rows = sanitizeRows(HTMLAttributes.rows);
    const caption =
      typeof HTMLAttributes.caption === "string" && HTMLAttributes.caption.trim()
        ? HTMLAttributes.caption
        : null;

    const tableSpec = [
      "table",
      { class: "giraffle-table" },
      [
        "tbody",
        {},
        ...rows.map((row, rowIndex) => [
          "tr",
          {},
          ...row.map((cell) => [
            rowIndex === 0 ? "th" : "td",
            {},
            cell,
          ]),
        ]),
      ],
    ] as const;

    return [
      "div",
      mergeAttributes(
        {
          "data-type": "table",
          "data-rows": JSON.stringify(rows),
          "data-caption": caption ?? "",
          class: "giraffle-table-block",
        },
        Object.fromEntries(
          Object.entries(HTMLAttributes).filter(
            ([key]) => key !== "rows" && key !== "caption"
          )
        )
      ),
      ...(caption ? [["div", { class: "giraffle-table-caption" }, caption]] : []),
      tableSpec,
    ];
  },

  addCommands() {
    return {
      insertTableBlock:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              rows: sanitizeRows(attributes.rows),
              caption: attributes.caption ?? null,
            },
          }),
    };
  },
});
