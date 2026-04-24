// ─── Cell color palette ───────────────────────────────────────
export const COAT_CELL_COLORS = [
  "amber",
  "rust",
  "forest",
  "slate",
  "lavender",
  "cream",
] as const;

export type CoatCellColor = (typeof COAT_CELL_COLORS)[number];

// ─── Note references ──────────────────────────────────────────
export interface NotePreview {
  id: string;
  title: string;
  icon: string | null;
  previewText: string;
}

// ─── Domain types ─────────────────────────────────────────────
export interface CoatCell {
  id: string;
  canvasId: string;
  noteId: string | null;
  note: NotePreview | null;
  title: string;
  content: string;
  colSpan: number;
  rowSpan: number;
  position: number;
  color: CoatCellColor | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CoatCanvas {
  id: string;
  userId: string;
  title: string;
  columns: number;
  cells: CoatCell[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CoatCanvasSummary {
  id: string;
  title: string;
  columns: number;
  cellCount: number;
  updatedAt: Date;
}

// ─── Input types ─────────────────────────────────────────────
export interface CreateCanvasInput {
  title?: string;
  cells?: Array<{
    title: string;
    content?: string;
    colSpan: number;
    rowSpan: number;
    color?: CoatCellColor;
  }>;
}

export interface UpdateCellInput {
  title?: string;
  content?: string;
  colSpan?: number;
  rowSpan?: number;
  color?: CoatCellColor | null;
  position?: number;
  noteId?: string | null;
}

// ─── Templates ───────────────────────────────────────────────
export type TemplateKey =
  | "blank"
  | "lean"
  | "swot"
  | "bmc"
  | "box7"
  | "box12";

export interface Template {
  key: TemplateKey;
  name: string;
  description: string;
  icon: string;
  cells: Array<{
    title: string;
    content: string;
    colSpan: number;
    rowSpan: number;
    color?: CoatCellColor;
  }>;
}

export const COAT_TEMPLATES: Template[] = [
  {
    key: "blank",
    name: "Blank",
    description: "Start from scratch",
    icon: "add_box",
    cells: [],
  },
  {
    key: "lean",
    name: "Lean Canvas",
    description: "9-block business model template",
    icon: "rocket_launch",
    cells: [
      { title: "Problem",          content: "The 3 most important problems you solve",         colSpan: 3, rowSpan: 2, color: "rust"    },
      { title: "Solution",            content: "The simplest solution for each problem",       colSpan: 3, rowSpan: 1, color: "forest"  },
      { title: "Value Proposition",    content: "The one clear message that makes you unique",        colSpan: 3, rowSpan: 2, color: "amber"   },
      { title: "Unfair Advantage",   content: "Something that cannot be copied easily",            colSpan: 3, rowSpan: 1, color: "slate"   },
      { title: "Customer Segment", content: "Target customers",                      colSpan: 3, rowSpan: 2, color: "lavender"},
      { title: "Existing Solutions",  content: "List existing alternatives",         colSpan: 3, rowSpan: 1, color: "cream"   },
      { title: "Channels",         content: "How do you reach the customer?",            colSpan: 3, rowSpan: 1, color: "cream"   },
      { title: "Early Adopters", content: "Profile of the first customer",                colSpan: 3, rowSpan: 1, color: "lavender"},
      { title: "Key Metrics",  content: "1-3 critical activities you measure",         colSpan: 3, rowSpan: 1, color: "forest"  },
      { title: "Cost Structure",   content: "Customer acquisition, distribution, hosting…", colSpan: 6, rowSpan: 1, color: "slate"   },
      { title: "Revenue Streams",   content: "Revenue model and lifetime value",     colSpan: 6, rowSpan: 1, color: "amber"   },
    ],
  },
  {
    key: "swot",
    name: "SWOT",
    description: "4-block strategic analysis",
    icon: "balance",
    cells: [
      { title: "Strengths",  content: "Internal advantages and strengths",   colSpan: 6, rowSpan: 2, color: "forest"  },
      { title: "Weaknesses",  content: "Internal factors open to improvement",    colSpan: 6, rowSpan: 2, color: "rust"    },
      { title: "Opportunities",     content: "Positive external factors",  colSpan: 6, rowSpan: 2, color: "amber"   },
      { title: "Threats",     content: "External risks and negative factors",  colSpan: 6, rowSpan: 2, color: "slate"   },
    ],
  },
  {
    key: "bmc",
    name: "Business Model",
    description: "9-block business model canvas",
    icon: "schema",
    cells: [
      { title: "Key Partners",   content: "",  colSpan: 3, rowSpan: 2, color: "lavender" },
      { title: "Key Activities",content: "",  colSpan: 3, rowSpan: 1, color: "slate"    },
      { title: "Value Propositions",    content: "",  colSpan: 3, rowSpan: 2, color: "amber"    },
      { title: "Customer Relationships", content: "",  colSpan: 3, rowSpan: 1, color: "forest"   },
      { title: "Customer Segments",content: "",  colSpan: 3, rowSpan: 2, color: "rust"     },
      { title: "Key Resources",  content: "",  colSpan: 3, rowSpan: 1, color: "slate"    },
      { title: "Channels",           content: "",  colSpan: 3, rowSpan: 1, color: "forest"   },
      { title: "Cost Structure",     content: "",  colSpan: 6, rowSpan: 1, color: "cream"    },
      { title: "Revenue Streams",     content: "",  colSpan: 6, rowSpan: 1, color: "cream"    },
    ],
  },
  {
    key: "box7",
    name: "7 Boxes",
    description: "Irregular 7-box general canvas",
    icon: "grid_view",
    cells: [
      { title: "Box 1", content: "", colSpan: 4, rowSpan: 2, color: "amber"   },
      { title: "Box 2", content: "", colSpan: 4, rowSpan: 1, color: "forest"  },
      { title: "Box 3", content: "", colSpan: 4, rowSpan: 2, color: "rust"    },
      { title: "Box 4", content: "", colSpan: 4, rowSpan: 1, color: "slate"   },
      { title: "Box 5", content: "", colSpan: 4, rowSpan: 1, color: "lavender"},
      { title: "Box 6", content: "", colSpan: 4, rowSpan: 1, color: "cream"   },
      { title: "Box 7", content: "", colSpan:12, rowSpan: 1, color: "amber"   },
    ],
  },
  {
    key: "box12",
    name: "12 Boxes",
    description: "12 equal blank boxes",
    icon: "apps",
    cells: Array.from({ length: 12 }, (_, i) => ({
      title: `Box ${i + 1}`,
      content: "",
      colSpan: 4,
      rowSpan: 1,
      color: (["amber", "forest", "rust", "slate", "lavender", "cream"] as CoatCellColor[])[i % 6],
    })),
  },
];
