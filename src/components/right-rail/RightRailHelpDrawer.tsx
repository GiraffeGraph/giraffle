"use client";

import { useEffect } from "react";

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;

const QUICK_LINKS = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/graph", label: "Graph", icon: "hub" },
] as const;

const PAGE_HELP: Record<string, { title: string; items: string[] }> = {
  "/settings": {
    title: "Settings",
    items: ["Manage provider keys, MCP tokens, updates, and sync logs.", "Self-host notes live here in Help now."],
  },
  "/graph": {
    title: "Graph",
    items: ["View note links and unresolved references.", "Open nodes to jump back into notes."],
  },
  "/stride": {
    title: "Stride",
    items: ["Plan todos on calendar views.", "Drag items to schedule work."],
  },
};

function getPageHelp(pathname: string) {
  const exact = PAGE_HELP[pathname];
  if (exact) return exact;

  const match = Object.entries(PAGE_HELP).find(([path]) => pathname.startsWith(`${path}/`));
  return match?.[1] ?? {
    title: "Workspace",
    items: ["Use left sidebar for notes and folders.", "Use right rail for tools, help, theme, and account actions."],
  };
}

export function RightRailHelpDrawer({
  appVersion,
  pathname,
  open,
  onClose,
  onNavigate,
}: {
  appVersion: string;
  pathname: string;
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const pageHelp = getPageHelp(pathname);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="right-rail-help-scrim" aria-label="Close help" onClick={onClose} />
      <aside className="right-rail-help" aria-label="Help panel">
        <header className="right-rail-help-head">
          <div>
            <span className="right-rail-help-kicker">Help</span>
            <h2>Giraffle</h2>
          </div>
          <button type="button" className="right-rail-help-close" onClick={onClose} aria-label="Close help">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <section className="right-rail-help-card">
          <div className="right-rail-help-row">
            <span>Version</span>
            <strong>v{appVersion}</strong>
          </div>
          <div className="right-rail-help-row">
            <span>Docker image</span>
            <code>efekurucay/giraffle:latest</code>
          </div>
        </section>

        <section className="right-rail-help-card">
          <h3>{pageHelp.title}</h3>
          <ul>
            {pageHelp.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="right-rail-help-card">
          <h3>Self-host env</h3>
          <div className="right-rail-help-chip-row">
            {REQUIRED_ENV_KEYS.map((key) => (
              <span key={key} className="right-rail-help-chip">{key}</span>
            ))}
          </div>
        </section>

        <section className="right-rail-help-card">
          <h3>Quick links</h3>
          <div className="right-rail-help-links">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => {
                  onNavigate(link.href);
                  onClose();
                }}
              >
                <span className="material-symbols-outlined">{link.icon}</span>
                {link.label}
              </button>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
