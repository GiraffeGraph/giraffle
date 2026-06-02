"use client";

import { useEffect, useState } from "react";
import { AgentPanel } from "./AgentPanel";

/**
 * App-wide Spotter. A floating launcher opens a right-side slide-over panel
 * hosting the agent, available on every page. Mounted once in the (main) layout
 * — which persists across in-app navigation — so the AgentPanel stays mounted
 * and the conversation survives switching pages and reopening the dock.
 */
export function SpotterDock() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {!open ? (
        <button
          type="button"
          style={styles.launcher}
          onClick={() => setOpen(true)}
          aria-label="Open Spotter (⌘J)"
          title="Spotter — ⌘J"
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22 }}>
            smart_toy
          </span>
        </button>
      ) : null}

      <aside
        style={{ ...styles.drawer, ...(open ? styles.drawerOpen : styles.drawerClosed) }}
        role="dialog"
        aria-label="Spotter"
        aria-hidden={!open}
      >
        <button
          type="button"
          style={styles.close}
          onClick={() => setOpen(false)}
          aria-label="Close Spotter (Esc)"
          title="Close — Esc"
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
            close
          </span>
        </button>
        <AgentPanel />
      </aside>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  launcher: {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 60,
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid var(--border-color)",
    background: "var(--accent, var(--md-sys-color-primary))",
    color: "var(--md-sys-color-on-primary, #fff)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
  },
  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    width: "clamp(360px, 32vw, 460px)",
    maxWidth: "100vw",
    zIndex: 70,
    background: "var(--surface, var(--md-sys-color-surface))",
    borderLeft: "1px solid var(--border-color)",
    boxShadow: "-8px 0 28px rgba(0,0,0,0.30)",
    display: "flex",
    flexDirection: "column",
    transition: "transform 200ms ease",
    willChange: "transform",
  },
  drawerOpen: { transform: "translateX(0)" },
  drawerClosed: { transform: "translateX(110%)", pointerEvents: "none" },
  close: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary, var(--md-sys-color-on-surface-variant))",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
};
