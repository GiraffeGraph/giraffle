"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

  return createPortal(
    <div className="command-palette-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
      >
        <div className="command-palette-header">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Not, klasör, etiket veya komut ara..."
            spellCheck={false}
          />
          <span className="command-palette-shortcut">Esc</span>
        </div>

        <div className="command-palette-body">
          {groupedItems.length === 0 ? (
            <div className="command-palette-empty">
              Bu sorgu için sonuç bulunamadı.
            </div>
          ) : (
            groupedItems.map(([groupLabel, groupItems]) => (
              <section key={groupLabel} className="command-palette-group">
                <div className="command-palette-group-title">{groupLabel}</div>
                <div className="command-palette-group-list">
                  {groupItems.map((item) => {
                    flatIndex += 1;
                    const isActive = flatIndex === selectedIndex;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`command-palette-item ${isActive ? "active" : ""}`}
                        onMouseEnter={() => setSelectedIndex(flatIndex)}
                        onClick={async () => {
                          onClose();
                          await item.onSelect();
                        }}
                      >
                        <span className="command-palette-item-icon">
                          {item.icon}
                        </span>
                        <span className="command-palette-item-copy">
                          <span className="command-palette-item-title-row">
                            <span className="command-palette-item-title">
                              {item.title}
                            </span>
                            {item.hint ? (
                              <span className="command-palette-item-hint">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          <span className="command-palette-item-description">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
