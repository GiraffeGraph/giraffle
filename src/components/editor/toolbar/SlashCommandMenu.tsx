"use client";

import { useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import type { SlashCommandItem } from "../extensions/slash-command";

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  style?: CSSProperties;
}

export function SlashCommandMenu({
  items,
  command,
  style,
}: SlashCommandMenuProps) {
  const itemsKey = items.map((item) => item.title).join("|");
  const [selection, setSelection] = useState({ itemsKey, index: 0 });
  const selectedIndex =
    selection.itemsKey === itemsKey && selection.index < items.length
      ? selection.index
      : 0;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (items.length === 0) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelection({
          itemsKey,
          index: (selectedIndex + 1) % items.length,
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelection({
          itemsKey,
          index: (selectedIndex - 1 + items.length) % items.length,
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
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

  if (items.length === 0) return null;

  return (
    <div className="slash-menu" style={style}>
      {items.map((item, index) => (
        <button
          key={item.title}
          className={`slash-menu-item ${index === selectedIndex ? "active" : ""}`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelection({ itemsKey, index })}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <div className="slash-menu-text">
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-description">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
