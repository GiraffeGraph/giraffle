export const APP_THEME_STORAGE_KEY = "graffle.theme";

export const APP_THEMES = [
  {
    id: "warm-paper",
    label: "Sıcak Kağıt",
    description: "Açık, sıcak ve kağıt hissi veren varsayılan tema.",
  },
  {
    id: "midnight-gold",
    label: "Gece Altını",
    description: "Derin gece mavisi ve güneş altını vurgular.",
  },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppThemeId = "warm-paper";

export const APP_THEME_IDS = APP_THEMES.map((theme) => theme.id);

export function isAppThemeId(value: string): value is AppThemeId {
  return APP_THEME_IDS.includes(value as AppThemeId);
}
