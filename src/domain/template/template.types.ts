// ─── Template Types ───────────────────────────────────────────
export const TEMPLATE_CATEGORIES = [
  "blank",
  "daily",
  "meeting",
  "project",
  "weekly",
  "custom",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface TemplateVariable {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  defaultValue?: string;
  options?: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  icon: string | null;
  blocks: TemplateBlock[];
  variables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateBlock {
  type: string;
  content: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  children?: TemplateBlock[];
}

export interface ApplyTemplateInput {
  templateId: string;
  title?: string;
  folderId?: string;
  variables?: Record<string, string>;
}
