// The one width at which Giraffle switches from a single stacked column to a
// side-by-side layout. Screens and the app shell must agree on it, or a window
// can end up with a sidebar and a phone-shaped screen inside it.
export const WIDE_LAYOUT_MIN_WIDTH = 720;
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { xs: 5, sm: 8, md: 11, lg: 14, sheet: 20, full: 999 } as const;
export const controls = { compact: 32, default: 40, comfortable: 46 } as const;
export const typography = {
  // A page title is a label for the document, not a banner: it stays close to
  // the first line of content so writing starts near the top of the window.
  pageTitle: { fontSize: 23, lineHeight: 29, fontWeight: "700" as const, letterSpacing: -0.6 },
  heading: { fontSize: 23, lineHeight: 29, fontWeight: "700" as const, letterSpacing: -0.55 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: "600" as const, letterSpacing: -0.12 },
  body: { fontSize: 14, lineHeight: 22, fontWeight: "400" as const },
  label: { fontSize: 12, lineHeight: 17, fontWeight: "600" as const, letterSpacing: 0.08 },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: "400" as const }
} as const;
export const light = { background:"#f8f7f3", surface:"#fdfcf9", surfaceStrong:"#ffffff", hover:"#f0eee7", pressed:"#e8e4da", text:"#242019", secondary:"#655e53", muted:"#857c70", faint:"#aaa092", border:"rgba(58,47,33,0.10)", borderStrong:"rgba(58,47,33,0.19)", accent:"#c8891d", accentInk:"#251a02", accentSubtle:"rgba(200,137,29,0.12)", link:"#176a72", danger:"#a4493d", success:"#36775b", warning:"#916019", scrim:"rgba(30,26,21,0.48)" } as const;
export const dark = { background:"#181817", surface:"#1e1e1d", surfaceStrong:"#252523", hover:"#292927", pressed:"#32322f", text:"#efeeea", secondary:"#bcb8af", muted:"#918c82", faint:"#6c675f", border:"rgba(255,251,240,0.09)", borderStrong:"rgba(255,251,240,0.16)", accent:"#dda33c", accentInk:"#171206", accentSubtle:"rgba(221,163,60,0.15)", link:"#dda33c", danger:"#e58d84", success:"#87c8ab", warning:"#d6b86f", scrim:"rgba(8,8,7,0.72)" } as const;
export type ThemeColors = { [K in keyof typeof light]: string };
