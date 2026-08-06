// The one width at which Giraffle switches from a single stacked column to a
// side-by-side layout. Screens and the app shell must agree on it, or a window
// can end up with a sidebar and a phone-shaped screen inside it.
export const WIDE_LAYOUT_MIN_WIDTH = 720;
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { xs: 4, sm: 7, md: 9, lg: 11, sheet: 18, full: 999 } as const;
export const controls = { compact: 30, default: 36, comfortable: 44 } as const;
export const typography = {
  hero: { fontSize: 32, lineHeight: 38, fontWeight: "700" as const, letterSpacing: -0.8 },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.4 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const },
  body: { fontSize: 14, lineHeight: 21, fontWeight: "400" as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "400" as const }
} as const;
export const light = { background:"#faf9f6", surface:"#fffefb", surfaceStrong:"#ffffff", hover:"#f3f0e9", pressed:"#ebe6dc", text:"#211d18", secondary:"#625b51", muted:"#8a8175", faint:"#b1a697", border:"rgba(60,48,34,0.11)", borderStrong:"rgba(60,48,34,0.20)", accent:"#d4931f", accentInk:"#2c1f00", accentSubtle:"rgba(212,147,31,0.11)", link:"#176b7a", danger:"#a8483a", success:"#2f7656", warning:"#996216", scrim:"rgba(32,28,23,0.36)" } as const;
export const dark = { background:"#191919", surface:"#202020", surfaceStrong:"#252525", hover:"#2b2b2b", pressed:"#323232", text:"#ebebea", secondary:"#b8b8b5", muted:"#8d8d89", faint:"#666662", border:"rgba(255,255,255,0.10)", borderStrong:"rgba(255,255,255,0.16)", accent:"#e1a63e", accentInk:"#0f1115", accentSubtle:"rgba(225,166,62,0.16)", link:"#e1a63e", danger:"#ef8d88", success:"#8dcfb7", warning:"#dfbf75", scrim:"rgba(0,0,0,0.62)" } as const;
export type ThemeColors = { [K in keyof typeof light]: string };
