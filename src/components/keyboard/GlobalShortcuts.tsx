"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ROUTES: Record<string, string> = {
  s: "/spotter",
  t: "/trails",
  n: "/notes",
  h: "/",
  c: "/savanna",
  r: "/stride",
};

const SHORTCUT_HELP: { keys: string; label: string }[] = [
  { keys: "⌘K  /  /", label: "Komut paleti" },
  { keys: "g  s", label: "Spotter" },
  { keys: "g  t", label: "Trails" },
  { keys: "g  n", label: "Notlar" },
  { keys: "g  c", label: "Savanna" },
  { keys: "g  r", label: "Stride" },
  { keys: "g  h", label: "Anasayfa" },
  { keys: "g  ,", label: "Settings" },
  { keys: "?", label: "Bu yardım" },
  { keys: "Esc", label: "Kapat" },
];

export function GlobalShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let lastG = 0;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Escape" && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      if (inField) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (e.key === "g") {
        lastG = Date.now();
        return;
      }

      if (Date.now() - lastG < 800) {
        if (e.key === ",") {
          e.preventDefault();
          router.push("/settings");
          lastG = 0;
          return;
        }
        const target = ROUTES[e.key];
        if (target) {
          e.preventDefault();
          router.push(target);
          lastG = 0;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Klavye kısayolları"
      onClick={() => setHelpOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92vw)",
          background: "var(--md-sys-color-surface, #1c1f26)",
          border: "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: 12,
          padding: 18,
          boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Klavye kısayolları
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {SHORTCUT_HELP.map((row) => (
            <li
              key={row.keys}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                gap: 16,
              }}
            >
              <span style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{row.label}</span>
              <code
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  background: "rgba(255,255,255,0.06)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {row.keys}
              </code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
