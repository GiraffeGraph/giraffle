export const APP_THEME_STORAGE_KEY = "graffle.theme";

export const APP_THEMES = [
  {
    id: "warm-paper",
    label: "Sicak Kagit",
    description: "Acik, sakin ve kagit hissi veren varsayilan tema.",
  },
  {
    id: "midnight-gold",
    label: "Gece Altini",
    description: "Derin gece mavisi ve gunes altini vurgular.",
  },
  {
    id: "graphite-night",
    label: "Grafit Gece",
    description: "Notion ve Obsidian'a yakin koyu grafit arayuz.",
  },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppThemeId = "warm-paper";

export const APP_THEME_IDS = APP_THEMES.map((theme) => theme.id);

export function isAppThemeId(value: string): value is AppThemeId {
  return APP_THEME_IDS.includes(value as AppThemeId);
}
