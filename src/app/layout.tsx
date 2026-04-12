import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  APP_THEME_COOKIE_KEY,
  DEFAULT_APP_THEME,
  isAppThemeId,
} from "@/components/theme/theme-config";
import "@/styles/tokens.css";
import "@/styles/reset.css";
import "@/styles/base.css";
import "@/styles/components/button.css";
import "@/styles/components/card.css";
import "@/styles/components/text-field.css";
import "@/styles/components/list.css";
import "@/styles/components/chip.css";
import "@/styles/components/dialog.css";
import "@/styles/components/navigation.css";
import "@/styles/components/command-palette.css";
import "@/styles/layouts/app-layout.css";
import "@/styles/layouts/sidebar.css";
import "@/styles/layouts/pages.css";
import "@/styles/layouts/shell.css";
import "@/styles/layouts/editor.css";
import "@/styles/layouts/sidebar-rail.css";
import "@/styles/layouts/enterprise.css";
import "@/styles/layouts/sidebar-v2.css";
import "@/styles/layouts/spotter-canvas.css";
import "@/styles/layouts/sidebar-rail-v2.css";
import "@/styles/layouts/universe.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giraffle — Bilgi Grafiği Editörü",
  description:
    "Bağlantılı notlar, wikilinkler ve bilgi grafiği yapısıyla blok tabanlı bir bilgi editörü.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get(APP_THEME_COOKIE_KEY)?.value;
  const initialTheme =
    storedTheme && isAppThemeId(storedTheme) ? storedTheme : DEFAULT_APP_THEME;

  return (
    <html lang="tr" data-theme={initialTheme} suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
