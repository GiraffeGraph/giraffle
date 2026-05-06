"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GraphIcon } from "./GraphIcon";
import { decodeStoredIcon } from "./sidebar-icon-utils";

export interface CommandPaletteItem {
  id: string;
  group: string;
  title: string;
  description: string;
  icon: string;
  hint?: string;
  onSelect: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  query: string;
  items: CommandPaletteItem[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
}

export function CommandPalette({
  open,
  query,
  items,
  onQueryChange,
  onClose,
}: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setSelectedIndex(0);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open, query, items.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (items.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((currentValue) => (currentValue + 1) % items.length);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (currentValue) => (currentValue - 1 + items.length) % items.length
        );
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selectedItem = items[selectedIndex];

        if (!selectedItem) {
          return;
        }

        onClose();
        await selectedItem.onSelect();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [items, onClose, open, selectedIndex]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CommandPaletteItem[]>();

    for (const item of items) {
      const currentGroup = groups.get(item.group) ?? [];
      currentGroup.push(item);
      groups.set(item.group, currentGroup);
    }

    return Array.from(groups.entries());
  }, [items]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  let flatIndex = -1;

  const renderItemIcon = (icon: string) => {
    if (icon === "__graph__") {
      return {
        className: "md-list-item-start",
        content: <GraphIcon />,
      };
    }

    const decoded = decodeStoredIcon(icon);

    if (decoded.kind === "material" && decoded.value) {
      return {
        className: "md-list-item-start material-symbols-outlined",
        content: decoded.value,
      };
    }

    return {
      className: "md-list-item-start",
      content: icon,
    };
  };

  return createPortal(
    <div className="md-dialog-scrim" role="presentation" style={{ alignItems: "flex-start", paddingTop: "12vh" }}>
      <div
        ref={dialogRef}
        className="md-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{ padding: 0, width: "100%", maxWidth: "700px", minHeight: "200px" }}
      >
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--md-sys-color-outline-variant)", padding: "16px 24px" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search notes, folders, or commands..."
            spellCheck={false}
            style={{ flex: 1, border: "none", background: "transparent", fontSize: "var(--md-sys-typescale-headline-small-size)", color: "var(--md-sys-color-on-surface)", outline: "none" }}
          />
          <kbd style={{ marginLeft: "16px", padding: "4px 8px", fontSize: "12px", background: "var(--md-sys-color-surface-container-high)", borderRadius: "4px", color: "var(--md-sys-color-on-surface-variant)" }}>Esc</kbd>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: "12px 16px" }}>
          {groupedItems.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--md-sys-color-on-surface-variant)" }}>
              No results found for this query.
            </div>
          ) : (
            groupedItems.map(([groupLabel, groupItems]) => (
              <section key={groupLabel} style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "var(--md-sys-typescale-label-small-size)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", color: "var(--md-sys-color-primary)", margin: "0 0 8px 12px" }}>
                  {groupLabel}
                </div>
                <ul className="md-list" style={{ padding: 0 }}>
                  {groupItems.map((item) => {
                    flatIndex += 1;
                    const isActive = flatIndex === selectedIndex;
                    const iconView = renderItemIcon(item.icon);

                    return (
                      <li key={item.id} style={{ display: "block", marginBottom: "2px" }}>
                        <button
                          type="button"
                          className={`md-list-item ${isActive ? "md-list-item--active" : ""}`}
                          style={{ width: "100%", textAlign: "left", borderRadius: "12px", background: isActive ? "var(--md-sys-color-secondary-container)" : "transparent", minHeight: "64px" }}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          onClick={async () => {
                            onClose();
                            await item.onSelect();
                          }}
                        >
                          <div
                            className={iconView.className}
                            style={{
                              fontSize: "24px",
                              lineHeight: 1,
                              letterSpacing: "normal",
                              color: isActive ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface)",
                            }}
                            aria-hidden="true"
                          >
                            {iconView.content}
                          </div>
                          <div className="md-list-item-content">
                            <span className="md-list-item-headline" style={{ color: isActive ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface)", display: "flex", alignItems: "center", gap: "8px" }}>
                              {item.title}
                              {item.hint ? (
                                <span style={{ fontSize: "var(--md-sys-typescale-label-small-size)", padding: "2px 6px", background: "var(--md-sys-color-surface-container-high)", borderRadius: "4px", color: "var(--md-sys-color-on-surface-variant)" }}>{item.hint}</span>
                              ) : null}
                            </span>
                            <span className="md-list-item-supporting-text" style={{ color: isActive ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface-variant)", opacity: isActive ? 0.9 : 1 }}>
                              {item.description}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
