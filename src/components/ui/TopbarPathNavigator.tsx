"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATIC_NAV_ROUTES, type NavRoute } from "@/lib/nav-routes";

interface DynamicSuggestions {
  notes: { id: string; title: string; icon: string | null }[];
  folders: { id: string; name: string; icon: string | null }[];
}

interface SuggestionItem {
  path: string;
  label: string;
  icon: string;
  kind: "static" | "note" | "folder";
}

function normalizeInternalPath(rawValue: string) {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue || trimmedValue.startsWith("//")) return null;

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(trimmedValue)) {
    try {
      const currentOrigin = window.location.origin;
      const url = new URL(trimmedValue);
      if (url.origin !== currentOrigin) return null;
      return `${url.pathname}${url.search}${url.hash}` || "/";
    } catch {
      return null;
    }
  }

  try {
    const normalizedValue = trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
    const url = new URL(normalizedValue, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return null;
  }
}

function buildAllSuggestions(dynamic: DynamicSuggestions | null): SuggestionItem[] {
  const items: SuggestionItem[] = STATIC_NAV_ROUTES.map((r: NavRoute) => ({
    path: r.path,
    label: r.label,
    icon: r.icon,
    kind: "static" as const,
  }));

  if (dynamic) {
    for (const note of dynamic.notes) {
      items.push({
        path: `/notes/${note.id}`,
        label: note.title || "Başlıksız not",
        icon: "description",
        kind: "note",
      });
    }
    for (const folder of dynamic.folders) {
      items.push({
        path: `/folders/${folder.id}`,
        label: folder.name,
        icon: "folder",
        kind: "folder",
      });
    }
  }

  return items;
}

function filterSuggestions(all: SuggestionItem[], query: string): SuggestionItem[] {
  const q = query.trim().toLowerCase();
  if (!q || q === "/") return all.filter((s) => s.kind === "static");

  return all.filter((s) => {
    const pathMatch = s.path.toLowerCase().includes(q);
    const labelMatch = s.label.toLowerCase().includes(q.replace(/^\//, ""));
    return pathMatch || labelMatch;
  }).slice(0, 12);
}

interface TopbarPathNavigatorProps {
  currentPath: string;
}

export function TopbarPathNavigator({ currentPath }: TopbarPathNavigatorProps) {
  const router = useRouter();
  const [draftPath, setDraftPath] = useState(currentPath);
  const [hasError, setHasError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dynamic, setDynamic] = useState<DynamicSuggestions | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetchedRef = useRef(false);

  const allSuggestions = buildAllSuggestions(dynamic);
  const filtered = filterSuggestions(allSuggestions, draftPath);

  const fetchDynamic = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const res = await fetch("/api/nav-suggestions");
      if (res.ok) {
        const data = await res.json() as DynamicSuggestions;
        setDynamic(data);
      }
    } catch {
      // silently fail — static suggestions still work
    }
  }, []);

  const handleFocus = useCallback(() => {
    setIsOpen(true);
    setActiveIndex(-1);
    void fetchDynamic();
  }, [fetchDynamic]);

  const navigateTo = useCallback((path: string) => {
    const next = normalizeInternalPath(path);
    if (!next) { setHasError(true); return; }
    setHasError(false);
    setDraftPath(next);
    setIsOpen(false);
    setActiveIndex(-1);
    if (next !== currentPath) router.push(next);
  }, [currentPath, router]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeIndex >= 0 && filtered[activeIndex]) {
      navigateTo(filtered[activeIndex].path);
    } else {
      navigateTo(draftPath);
    }
  }, [activeIndex, filtered, draftPath, navigateTo]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Tab" && filtered[0]) {
      event.preventDefault();
      setDraftPath(filtered[0].path);
      setActiveIndex(0);
    }
  }, [isOpen, filtered]);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = containerRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const showDropdown = isOpen && filtered.length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", width: "100%", minWidth: 0 }}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", minWidth: 0 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            minWidth: 0,
            flex: 1,
            height: "28px",
            padding: "0 10px",
            borderRadius: "999px",
            border: `1px solid ${hasError ? "var(--md-sys-color-error)" : "var(--md-sys-color-outline-variant)"}`,
            background: hasError
              ? "color-mix(in srgb, var(--md-sys-color-error) 10%, var(--md-sys-color-surface-container-highest))"
              : "var(--md-sys-color-surface-container-highest)",
          }}
          title={hasError ? "Geçerli bir iç yol gir. Örn: /dashboard veya /notes/123" : "İç yol ile git"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "var(--md-sys-color-on-surface-variant)", flexShrink: 0 }} aria-hidden="true">
            route
          </span>
          <input
            ref={inputRef}
            value={draftPath}
            onChange={(e) => {
              setDraftPath(e.target.value);
              setActiveIndex(-1);
              if (!isOpen) setIsOpen(true);
              if (hasError) setHasError(false);
            }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            aria-label="Gitmek istediğin iç yol"
            aria-invalid={hasError}
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            spellCheck={false}
            placeholder="/dashboard"
            style={{
              width: "100%",
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--md-sys-color-on-surface)",
              fontSize: "12px",
              fontFamily: "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace)",
            }}
          />
        </div>

        <button
          type="submit"
          aria-label="Yola git"
          title="Yola git"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "999px",
            border: "1px solid var(--md-sys-color-outline-variant)",
            background: "var(--md-sys-color-surface-container-highest)",
            color: "var(--md-sys-color-on-surface-variant)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">arrow_forward</span>
        </button>
      </form>

      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: "36px",
            background: "var(--md-sys-color-surface-container-high)",
            border: "1px solid var(--md-sys-color-outline-variant)",
            borderRadius: "12px",
            boxShadow: "var(--md-sys-elevation-3)",
            zIndex: 200,
            maxHeight: "280px",
            overflowY: "auto",
            padding: "4px",
          }}
        >
          {filtered.map((item, idx) => (
            <button
              key={item.path}
              role="option"
              aria-selected={idx === activeIndex}
              data-idx={idx}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                navigateTo(item.path);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "6px 10px",
                border: "none",
                borderRadius: "8px",
                background: idx === activeIndex ? "var(--md-sys-color-secondary-container)" : "transparent",
                color: idx === activeIndex ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface)",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "12px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "15px", flexShrink: 0, color: idx === activeIndex ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface-variant)" }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </span>
              <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: "11px", color: "var(--md-sys-color-on-surface-variant)", flexShrink: 0, opacity: 0.7 }}>
                {item.path}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
