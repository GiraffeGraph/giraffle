export const APP_THEME_STORAGE_KEY = "giraffle.theme";
export const APP_THEME_COOKIE_KEY = "giraffle.theme";

export const APP_THEMES = [
  {
    id: "warm-paper",
    label: "Warm Paper",
    description: "The default light theme with a calm, paper-like feel.",
  },
  {
    id: "midnight-gold",
    label: "Amber Giraffe",
    description: "Warm amber and honey-toned surfaces.",
  },
  {
    id: "graphite-night",
    label: "Graphite Night",
    description: "A dark graphite interface inspired by Notion and Obsidian.",
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
