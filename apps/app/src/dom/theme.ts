/**
 * Theme colours cross the DOM component boundary as plain JSON props, so both
 * surfaces describe their palette as a flat record and turn it into CSS custom
 * properties inside the web realm.
 */

export interface EditorTheme {
  text: string;
  muted: string;
  link: string;
  /** The webview paints white by default, which shows through as a slab. */
  background: string;
}

export interface CanvasTheme {
  bg: string;
  dot: string;
  surface: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
  danger: string;
}

export function editorCssVariables(theme: EditorTheme): Record<string, string> {
  return {
    "--giraffle-ink": theme.text,
    "--giraffle-muted": theme.muted,
    "--giraffle-link": theme.link,
    "--giraffle-bg": theme.background,
  };
}

/**
 * Excalidraw styles its chrome from a documented set of custom properties, so
 * the palette is applied by overriding those on the host element. `bg` is the
 * one colour Excalidraw owns itself — it becomes `viewBackgroundColor` on the
 * scene rather than a variable. `dot` paints the host element underneath the
 * canvas; Excalidraw 0.18 has no public grid colour.
 */
export function canvasCssVariables(theme: CanvasTheme): Record<string, string> {
  return {
    "--giraffle-canvas-bg": theme.bg,
    "--giraffle-canvas-dot": theme.dot,
    "--island-bg-color": theme.surface,
    "--popup-bg-color": theme.surface,
    "--color-surface-low": theme.surface,
    "--color-surface-lowest": theme.surface,
    "--text-primary-color": theme.ink,
    "--popup-text-color": theme.ink,
    "--color-on-surface": theme.ink,
    "--icon-fill-color": theme.ink,
    "--text-color": theme.muted,
    "--color-surface-mid": theme.muted,
    "--default-border-color": theme.border,
    "--color-border-outline": theme.border,
    "--color-primary": theme.accent,
    "--color-danger": theme.danger,
  };
}
