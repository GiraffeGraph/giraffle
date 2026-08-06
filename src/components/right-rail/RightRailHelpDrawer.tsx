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
  { href: "/notes", label: "Notes", icon: "description" },
] as const;

const PAGE_HELP: Record<string, { title: string; items: string[] }> = {
  "/settings": {
    title: "Settings",
    items: ["Check for updates and choose which apps can connect.", "Activity shows whether your latest changes are saved."],
  },
  "/notes": {
    title: "Notes",
    items: ["Write pages and add tasks in one place.", "Use folders when you want to group related pages."],
  },
  "/kanban": {
    title: "Trek",
    items: ["Move tasks through clear stages.", "A task keeps the same date and priority everywhere."],
  },
  "/stride": {
    title: "Stride",
    items: ["Plan tasks on a calendar.", "Select a task's page or board name to open it."],
  },
  "/tower-matrix": {
    title: "Tower Matrix",
    items: ["Decide which pages need attention first.", "Select a page to organize its tasks."],
  },
  "/savanna": {
    title: "Savanna",
    items: ["Arrange your pages on a free-form canvas.", "Open a page from the canvas whenever you need it."],
  },
};

function getPageHelp(pathname: string) {
  const exact = PAGE_HELP[pathname];
  if (exact) return exact;

  const match = Object.entries(PAGE_HELP).find(([path]) => pathname.startsWith(`${path}/`));
  return match?.[1] ?? {
    title: "Workspace",
    items: ["Find pages and folders on the left.", "Find search, help, appearance, and account actions on the right."],
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
        </section>

        <section className="right-rail-help-card">
          <h3>{pageHelp.title}</h3>
          <ul>
            {pageHelp.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <details className="right-rail-help-card">
          <summary>Installation details</summary>
          <div className="right-rail-help-row">
            <span>Install image</span>
            <code>efekurucay/giraffle:latest</code>
          </div>
          <div className="right-rail-help-chip-row">
            {REQUIRED_ENV_KEYS.map((key) => (
              <span key={key} className="right-rail-help-chip">{key}</span>
            ))}
          </div>
        </details>

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
