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

// ─── Domain types ─────────────────────────────────────────────
export interface CoatCell {
  id: string;
  canvasId: string;
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
    name: "Boş",
    description: "Sıfırdan başla",
    icon: "add_box",
    cells: [],
  },
  {
    key: "lean",
    name: "Lean Canvas",
    description: "9 kutulu iş modeli şablonu",
    icon: "rocket_launch",
    cells: [
      { title: "Problem",          content: "Çözdüğün en önemli 3 problem",         colSpan: 3, rowSpan: 2, color: "rust"    },
      { title: "Çözüm",            content: "Her problem için en basit çözüm",       colSpan: 3, rowSpan: 1, color: "forest"  },
      { title: "Değer Önerisi",    content: "Seni özel kılan tek, net mesaj",        colSpan: 3, rowSpan: 2, color: "amber"   },
      { title: "Haksız Avantaj",   content: "Kolayca kopyalanamayan şey",            colSpan: 3, rowSpan: 1, color: "slate"   },
      { title: "Müşteri Segmenti", content: "Hedef müşteriler",                      colSpan: 3, rowSpan: 2, color: "lavender"},
      { title: "Mevcut Çözümler",  content: "Mevcut alternatifleri listele",         colSpan: 3, rowSpan: 1, color: "cream"   },
      { title: "Kanallar",         content: "Müşteriye nasıl ulaşırsın?",            colSpan: 3, rowSpan: 1, color: "cream"   },
      { title: "Erken Benimseyen", content: "İlk müşterinin profili",                colSpan: 3, rowSpan: 1, color: "lavender"},
      { title: "Temel Metrikler",  content: "Ölçtüğün 1-3 kritik aktivite",         colSpan: 3, rowSpan: 1, color: "forest"  },
      { title: "Maliyet Yapısı",   content: "Müşteri edinme, dağıtım, barındırma…", colSpan: 6, rowSpan: 1, color: "slate"   },
      { title: "Gelir Akışları",   content: "Gelir modeli ve yaşam boyu değer",     colSpan: 6, rowSpan: 1, color: "amber"   },
    ],
  },
  {
    key: "swot",
    name: "SWOT",
    description: "4 kutulu stratejik analiz",
    icon: "balance",
    cells: [
      { title: "Güçlü Yönler",  content: "İçsel avantajlar ve üstünlükler",   colSpan: 6, rowSpan: 2, color: "forest"  },
      { title: "Zayıf Yönler",  content: "Geliştirmeye açık iç faktörler",    colSpan: 6, rowSpan: 2, color: "rust"    },
      { title: "Fırsatlar",     content: "Dışarıdan gelen olumlu faktörler",  colSpan: 6, rowSpan: 2, color: "amber"   },
      { title: "Tehditler",     content: "Dış riskler ve olumsuz faktörler",  colSpan: 6, rowSpan: 2, color: "slate"   },
    ],
  },
  {
    key: "bmc",
    name: "Business Model",
    description: "9 kutulu iş modeli kanvası",
    icon: "schema",
    cells: [
      { title: "Anahtar Ortaklar",   content: "",  colSpan: 3, rowSpan: 2, color: "lavender" },
      { title: "Anahtar Faaliyetler",content: "",  colSpan: 3, rowSpan: 1, color: "slate"    },
      { title: "Değer Önerileri",    content: "",  colSpan: 3, rowSpan: 2, color: "amber"    },
      { title: "Müşteri İlişkileri", content: "",  colSpan: 3, rowSpan: 1, color: "forest"   },
      { title: "Müşteri Segmentleri",content: "",  colSpan: 3, rowSpan: 2, color: "rust"     },
      { title: "Anahtar Kaynaklar",  content: "",  colSpan: 3, rowSpan: 1, color: "slate"    },
      { title: "Kanallar",           content: "",  colSpan: 3, rowSpan: 1, color: "forest"   },
      { title: "Maliyet Yapısı",     content: "",  colSpan: 6, rowSpan: 1, color: "cream"    },
      { title: "Gelir Akışları",     content: "",  colSpan: 6, rowSpan: 1, color: "cream"    },
    ],
  },
  {
    key: "box7",
    name: "7 Kutu",
    description: "Düzensiz 7 kutulu genel canvas",
    icon: "grid_view",
    cells: [
      { title: "Kutu 1", content: "", colSpan: 4, rowSpan: 2, color: "amber"   },
      { title: "Kutu 2", content: "", colSpan: 4, rowSpan: 1, color: "forest"  },
      { title: "Kutu 3", content: "", colSpan: 4, rowSpan: 2, color: "rust"    },
      { title: "Kutu 4", content: "", colSpan: 4, rowSpan: 1, color: "slate"   },
      { title: "Kutu 5", content: "", colSpan: 4, rowSpan: 1, color: "lavender"},
      { title: "Kutu 6", content: "", colSpan: 4, rowSpan: 1, color: "cream"   },
      { title: "Kutu 7", content: "", colSpan:12, rowSpan: 1, color: "amber"   },
    ],
  },
  {
    key: "box12",
    name: "12 Kutu",
    description: "12 eşit kutulu boş canvas",
    icon: "apps",
    cells: Array.from({ length: 12 }, (_, i) => ({
      title: `Kutu ${i + 1}`,
      content: "",
      colSpan: 4,
      rowSpan: 1,
      color: (["amber", "forest", "rust", "slate", "lavender", "cream"] as CoatCellColor[])[i % 6],
    })),
  },
];
