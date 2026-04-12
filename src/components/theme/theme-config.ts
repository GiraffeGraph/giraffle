export const APP_THEME_STORAGE_KEY = "giraffle.theme";
export const APP_THEME_COOKIE_KEY = "giraffle.theme";

export const APP_THEMES = [
  {
    id: "warm-paper",
    label: "Sıcak Kağıt",
    description: "Açık, sakin ve kağıt hissi veren varsayılan tema.",
  },
  {
    id: "midnight-gold",
    label: "Amber Giraffe",
    description: "Sıcak amber ve bal rengi yüzeyler.",
  },
  {
    id: "graphite-night",
    label: "Grafit Gece",
    description: "Notion ve Obsidian'a yakın koyu grafit arayüz.",
  },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppThemeId = "warm-paper";

export const APP_THEME_IDS = APP_THEMES.map((theme) => theme.id);

export function isAppThemeId(value: string): value is AppThemeId {
  return APP_THEME_IDS.includes(value as AppThemeId);
}

export function persistAppTheme(themeId: AppThemeId) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themeId;
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
  document.cookie = `${APP_THEME_COOKIE_KEY}=${themeId}; path=/; max-age=31536000; samesite=lax`;
}
