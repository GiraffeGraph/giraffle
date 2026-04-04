import type { Metadata } from "next";
import {
  APP_THEME_IDS,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
} from "@/components/theme/theme-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graffle — Knowledge Graph Editor",
  description:
    "A block-based knowledge editor with linked notes, wikilinks, and graph structure.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeBootstrapScript = `
    (function () {
      try {
        var key = ${JSON.stringify(APP_THEME_STORAGE_KEY)};
        var fallback = ${JSON.stringify(DEFAULT_APP_THEME)};
        var allowed = ${JSON.stringify(APP_THEME_IDS)};
        var stored = localStorage.getItem(key);
        var theme = allowed.indexOf(stored) >= 0 ? stored : fallback;
        document.documentElement.dataset.theme = theme;
      } catch (error) {
        document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_APP_THEME)};
      }
    })();
  `;

  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {children}
      </body>
    </html>
  );
}
