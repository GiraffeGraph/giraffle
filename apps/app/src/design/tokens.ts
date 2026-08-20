// The one width at which Giraffle switches from a single stacked column to a
// side-by-side layout. Screens and the app shell must agree on it, or a window
// can end up with a sidebar and a phone-shaped screen inside it.
export const WIDE_LAYOUT_MIN_WIDTH = 720;

/**
 * The frame the document sits in. A window can be any width; the writing column
 * is not, so long lines stay readable and every page starts at the same margin.
 */
export const layout = {
  sidebarWidth: 240,
  topbarHeight: 45,
  /** The reading column. Wider than this and the eye loses the line start. */
  contentWidth: 708,
  /** Breathing room either side of the column on a roomy window. */
  contentGutter: 96,
  contentGutterNarrow: 24,
  /** One row in the sidebar tree. */
  rowHeight: 28,
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { xs: 3, sm: 4, md: 6, lg: 8, sheet: 12, full: 999 } as const;
export const controls = { compact: 28, default: 36, comfortable: 44 } as const;

/**
 * Two scales in one. Chrome — sidebar rows, buttons, property labels — reads at
 * 14 and stays out of the way. The document reads at 16, because that is the
 * text a person actually came to write.
 */
export const typography = {
  pageTitle: { fontSize: 40, lineHeight: 48, fontWeight: "700" as const, letterSpacing: -1.2 },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: "600" as const, letterSpacing: -0.4 },
  title: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const, letterSpacing: -0.05 },
  body: { fontSize: 14, lineHeight: 21, fontWeight: "400" as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 0.06 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
} as const;

/** The document's own scale, mirrored by the editor's stylesheet. */
export const documentScale = {
  body: { fontSize: 16, lineHeight: 25 },
  h1: { fontSize: 30, lineHeight: 38, fontWeight: "600" as const },
  h2: { fontSize: 24, lineHeight: 31, fontWeight: "600" as const },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
} as const;

/**
 * Warm paper, not grey. `background` is the page the document sits on and stays
 * the lightest surface; `sidebar` sits a shade behind it so the writing area
 * reads as the thing in front.
 */
export const light = { background:"#fefdfa", surface:"#f8f7f3", surfaceStrong:"#ffffff", sidebar:"#f5f3ed", hover:"rgba(58,47,33,0.055)", pressed:"rgba(58,47,33,0.10)", selected:"rgba(58,47,33,0.08)", text:"#242019", secondary:"#655e53", muted:"#857c70", faint:"#aaa092", border:"rgba(58,47,33,0.09)", borderStrong:"rgba(58,47,33,0.16)", accent:"#c8891d", accentInk:"#251a02", accentSubtle:"rgba(200,137,29,0.12)", link:"#176a72", danger:"#a4493d", success:"#36775b", warning:"#916019", scrim:"rgba(30,26,21,0.48)" } as const;
export const dark = { background:"#191918", surface:"#202020", surfaceStrong:"#252523", sidebar:"#1c1c1b", hover:"rgba(255,251,240,0.055)", pressed:"rgba(255,251,240,0.10)", selected:"rgba(255,251,240,0.08)", text:"#efeeea", secondary:"#bcb8af", muted:"#918c82", faint:"#6c675f", border:"rgba(255,251,240,0.09)", borderStrong:"rgba(255,251,240,0.16)", accent:"#dda33c", accentInk:"#171206", accentSubtle:"rgba(221,163,60,0.15)", link:"#dda33c", danger:"#e58d84", success:"#87c8ab", warning:"#d6b86f", scrim:"rgba(8,8,7,0.72)" } as const;
export type ThemeColors = { [K in keyof typeof light]: string };
