export interface NavRoute {
  path: string;
  label: string;
  icon: string;
}

export const STATIC_NAV_ROUTES: NavRoute[] = [
  { path: "/dashboard", label: "Pano", icon: "home" },
  { path: "/inbox", label: "Gelen kutusu", icon: "inbox" },
  { path: "/library", label: "Kütüphane", icon: "library_books" },
  { path: "/notegpt", label: "NoteGPT", icon: "smart_toy" },
  { path: "/search", label: "Arama", icon: "search" },
  { path: "/templates", label: "Şablonlar", icon: "tooltip" },
  { path: "/publish", label: "Yayınlar", icon: "publish" },
  { path: "/proposals", label: "Öneriler", icon: "auto_awesome" },
  { path: "/graph", label: "Bağlantı ağı", icon: "hub" },
  { path: "/settings", label: "Ayarlar", icon: "settings" },
  { path: "/account", label: "Hesap", icon: "account_circle" },
];
