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

  const renderIconNode = (icon: string) => {
    if (icon === "__graph__") {
      return <GraphIcon size={16} />;
    }
    const decoded = decodeStoredIcon(icon);
    if (decoded.kind === "material" && decoded.value) {
      return (
        <span className="material-symbols-outlined" aria-hidden="true">
          {decoded.value}
        </span>
      );
    }
    return <span aria-hidden="true">{icon}</span>;
  };

  return createPortal(
    <div className="md-dialog-scrim cmdp-scrim" role="presentation">
      <div
        ref={dialogRef}
        className="md-dialog cmdp"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="cmdp-search">
          <span
            className="material-symbols-outlined cmdp-search-icon"
            aria-hidden="true"
          >
            search
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search notes, folders, or commands..."
            spellCheck={false}
            className="cmdp-input"
          />
          <kbd className="cmdp-kbd">Esc</kbd>
        </div>

        <div className="cmdp-body">
          {groupedItems.length === 0 ? (
            <div className="cmdp-empty">No results found</div>
          ) : (
            groupedItems.map(([groupLabel, groupItems]) => (
              <section key={groupLabel} className="cmdp-group">
                <div className="cmdp-group-label">{groupLabel}</div>
                <ul className="cmdp-list">
                  {groupItems.map((item) => {
                    flatIndex += 1;
                    const isActive = flatIndex === selectedIndex;
                    const itemIndex = flatIndex;

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`cmdp-item${isActive ? " cmdp-item--active" : ""}`}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          onClick={async () => {
                            onClose();
                            await item.onSelect();
                          }}
                        >
                          <span className="cmdp-item-icon">
                            {renderIconNode(item.icon)}
                          </span>
                          <span className="cmdp-item-body">
                            <span className="cmdp-item-title">
                              {item.title}
                              {item.hint ? (
                                <span className="cmdp-item-hint">{item.hint}</span>
                              ) : null}
                            </span>
                            <span className="cmdp-item-desc">
                              {item.description}
                            </span>
                          </span>
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
