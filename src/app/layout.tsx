import type { Metadata } from "next";
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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
