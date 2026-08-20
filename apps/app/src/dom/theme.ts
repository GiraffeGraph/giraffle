/**
 * Theme colours cross the DOM component boundary as plain JSON props, so both
 * surfaces describe their palette as a flat record and turn it into CSS custom
 * properties inside the web realm.
 */

import { documentScale, radii, spacing } from "@/design/tokens";

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
 * One control in the block gutter: the `+` and the drag handle are the same
 * square so a block's controls read as a pair.
 */
const blockControl = 18;

/**
 * The gutter the block controls live in. It belongs to the document's metrics
 * because the text column has to start clear of the controls — they fade in on
 * hover, and a column that started at the edge would have them land on the
 * first character.
 */
const documentGutter = blockControl * 2 + spacing.xxs + spacing.xs;

/**
 * The document's scale and rhythm as CSS custom properties. The editor runs in
 * its own realm and cannot read the native tokens at paint time, so the same
 * `documentScale` every screen types against is handed across the boundary
 * rather than restated as a second stylesheet.
 */
export function editorMetricVariables(): Record<string, string> {
  return {
    "--giraffle-doc-size": `${documentScale.body.fontSize}px`,
    "--giraffle-doc-leading": `${documentScale.body.lineHeight}px`,
    "--giraffle-doc-h1-size": `${documentScale.h1.fontSize}px`,
    "--giraffle-doc-h1-leading": `${documentScale.h1.lineHeight}px`,
    "--giraffle-doc-h2-size": `${documentScale.h2.fontSize}px`,
    "--giraffle-doc-h2-leading": `${documentScale.h2.lineHeight}px`,
    "--giraffle-doc-h3-size": `${documentScale.h3.fontSize}px`,
    "--giraffle-doc-h3-leading": `${documentScale.h3.lineHeight}px`,
    "--giraffle-doc-heading-weight": documentScale.h1.fontWeight,
    // A heading takes its space from the block above it, not from the text it
    // introduces, and consecutive paragraphs sit a hair apart rather than a
    // blank line. That gap is what makes a page read as blocks.
    "--giraffle-doc-gap": `${spacing.xxs}px`,
    "--giraffle-doc-h1-lead": `${spacing.xxl}px`,
    "--giraffle-doc-h2-lead": `${spacing.xl}px`,
    "--giraffle-doc-h3-lead": `${spacing.lg}px`,
    "--giraffle-doc-gutter": `${documentGutter}px`,
    "--giraffle-doc-control": `${blockControl}px`,
    "--giraffle-doc-control-gap": `${spacing.xxs}px`,
    "--giraffle-doc-radius": `${radii.sm}px`,
    "--giraffle-doc-sheet-radius": `${radii.lg}px`,
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
