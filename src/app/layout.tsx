import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  APP_THEME_COOKIE_KEY,
  DEFAULT_APP_THEME,
  isAppThemeId,
} from "@/components/theme/theme-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graffle — Knowledge Graph Editor",
  description:
    "A block-based knowledge editor with linked notes, wikilinks, and graph structure.",
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
