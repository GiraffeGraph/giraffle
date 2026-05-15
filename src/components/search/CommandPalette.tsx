"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface NoteHit {
  id: string;
  title: string;
  slug: string | null;
  icon: string | null;
  updatedAt: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (!inField && e.key === "/" && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const json = (await res.json()) as { notes: NoteHit[] };
        setResults(json.notes);
        setActiveIdx(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  const select = useCallback(
    (hit: NoteHit) => {
      setOpen(false);
      setQuery("");
      router.push(`/notes/${hit.id}`);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Komut paleti"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          background: "var(--md-sys-color-surface, #1c1f26)",
          border: "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: 12,
          boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((idx) => Math.min(idx + 1, Math.max(0, results.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((idx) => Math.max(idx - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const hit = results[activeIdx];
              if (hit) select(hit);
            }
          }}
          placeholder="Notlarda ara… (Cmd+K)"
          spellCheck={false}
          autoComplete="off"
          style={{
            width: "100%",
            padding: "14px 18px",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "inherit",
            fontSize: 15,
            borderBottom: results.length || loading || query
              ? "1px solid var(--md-sys-color-outline-variant)"
              : "none",
          }}
        />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "55vh", overflowY: "auto" }}>
          {loading && query.trim() ? (
            <li
              style={{
                padding: "10px 18px",
                fontSize: 12,
                color: "var(--md-sys-color-on-surface-variant)",
              }}
            >
              Aranıyor…
            </li>
          ) : null}
          {!loading && query.trim() && results.length === 0 ? (
            <li
              style={{
                padding: "10px 18px",
                fontSize: 12,
                color: "var(--md-sys-color-on-surface-variant)",
              }}
            >
              Sonuç yok.
            </li>
          ) : null}
          {results.map((hit, idx) => (
            <li
              key={hit.id}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => select(hit)}
              style={{
                padding: "10px 18px",
                fontSize: 14,
                cursor: "pointer",
                background:
                  idx === activeIdx ? "rgba(245, 165, 36, 0.12)" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span aria-hidden="true">{hit.icon ?? "📝"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {hit.title || "Başlıksız"}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--md-sys-color-on-surface-variant)",
                }}
              >
                {new Date(hit.updatedAt).toLocaleDateString("tr-TR")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
