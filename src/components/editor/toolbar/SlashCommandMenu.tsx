"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

export interface CommandMenuItem {
  title: string;
  description: string;
  icon: string;
  shortcut?: string;
}

interface SlashCommandMenuProps<T extends CommandMenuItem> {
  items: T[];
  command: (item: T) => void;
  style?: CSSProperties;
  title?: string;
  subtitle?: string;
}

export function SlashCommandMenu<T extends CommandMenuItem>({
  items,
  command,
  style,
  title = "Komutlar",
  subtitle = "Yön tuşları ile gezin, Enter ile uygula",
}: SlashCommandMenuProps<T>) {
  const itemsKey = items.map((item) => item.title).join("|");
  const [selection, setSelection] = useState({ itemsKey, index: 0 });
  const selectedIndex =
    selection.itemsKey === itemsKey && selection.index < items.length
      ? selection.index
      : 0;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (items.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelection({
          itemsKey,
          index: (selectedIndex + 1) % items.length,
        });
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelection({
          itemsKey,
          index: (selectedIndex - 1 + items.length) % items.length,
        });
      }

      if (event.key === "Enter") {
        event.preventDefault();

        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
      }
    },
    [command, items, itemsKey, selectedIndex]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="slash-menu" style={style}>
      <div className="slash-menu-header">
        <span className="slash-menu-eyebrow">{title}</span>
        <span className="slash-menu-hint">{subtitle}</span>
      </div>

      <div className="slash-menu-list">
        {items.map((item, index) => (
          <button
            key={`${item.title}-${item.shortcut ?? ""}`}
            className={`slash-menu-item ${index === selectedIndex ? "active" : ""}`}
            onClick={() => command(item)}
            onMouseEnter={() => setSelection({ itemsKey, index })}
          >
            <span className="slash-menu-icon">{item.icon}</span>
            <span className="slash-menu-text">
              <span className="slash-menu-title-row">
                <span className="slash-menu-title">{item.title}</span>
                {item.shortcut ? (
                  <span className="slash-menu-shortcut">{item.shortcut}</span>
                ) : null}
              </span>
              <span className="slash-menu-description">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
