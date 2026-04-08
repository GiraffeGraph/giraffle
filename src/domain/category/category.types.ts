export const NOTE_CATEGORY_COLOR_OPTIONS = [
  "slate",
  "blue",
  "green",
  "amber",
  "rose",
] as const;

export type NoteCategoryColor = (typeof NOTE_CATEGORY_COLOR_OPTIONS)[number];

export interface NoteCategorySummary {
  id: string;
  name: string;
  color: NoteCategoryColor;
  icon: string | null;
}

export function normalizeNoteCategoryColor(
  value?: string | null
): NoteCategoryColor {
  if (
    value &&
    NOTE_CATEGORY_COLOR_OPTIONS.includes(value as NoteCategoryColor)
  ) {
    return value as NoteCategoryColor;
  }

  return "slate";
}

export function getNoteCategoryColorTokens(color?: string | null) {
  switch (normalizeNoteCategoryColor(color)) {
    case "blue":
      return {
        background: "var(--md-sys-color-primary-container)",
        foreground: "var(--md-sys-color-on-primary-container)",
      };
    case "green":
      return {
        background: "var(--md-sys-color-secondary-container)",
        foreground: "var(--md-sys-color-on-secondary-container)",
      };
    case "amber":
      return {
        background: "var(--md-sys-color-tertiary-container)",
        foreground: "var(--md-sys-color-on-tertiary-container)",
      };
    case "rose":
      return {
        background: "var(--md-sys-color-error-container)",
        foreground: "var(--md-sys-color-on-error-container)",
      };
    default:
      return {
        background: "var(--md-sys-color-surface-container-highest)",
        foreground: "var(--md-sys-color-on-surface)",
      };
  }
}
