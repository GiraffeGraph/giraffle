"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

export interface CommandMenuItem {
  title: string;
  description: string;
  icon: string;
  shortcut?: string;
  menuKey?: string;
}

interface SlashCommandMenuProps<T extends CommandMenuItem> {
  items: T[];
  command: (item: T) => void;
  style?: CSSProperties;
  title?: string;
}

export function SlashCommandMenu<T extends CommandMenuItem>({
  items,
  command,
  style,
  title = "Commands",
}: SlashCommandMenuProps<T>) {
  const getItemKey = useCallback(
    (item: T, index: number) =>
      item.menuKey?.trim().length
        ? item.menuKey
        : `${item.title}-${item.shortcut ?? item.description}-${index}`,
    []
  );
  const itemsKey = items.map((item, index) => getItemKey(item, index)).join("|");
  const [selection, setSelection] = useState({ itemsKey, index: 0 });
  const selectedIndex =
    selection.itemsKey === itemsKey && selection.index < items.length
      ? selection.index
      : 0;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.isComposing || items.length === 0) {
        return;
      }

      const consumeEvent = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (event.key === "ArrowDown") {
        consumeEvent();
        setSelection({
          itemsKey,
          index: (selectedIndex + 1) % items.length,
        });
      }

      if (event.key === "ArrowUp") {
        consumeEvent();
        setSelection({
          itemsKey,
          index: (selectedIndex - 1 + items.length) % items.length,
        });
      }

      if (event.key === "Enter") {
        consumeEvent();

        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
      }
    },
    [command, items, itemsKey, selectedIndex]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="slash-menu" style={style}>
      <div className="slash-menu-header">
        <span className="slash-menu-eyebrow">{title}</span>
      </div>

      <div className="slash-menu-list">
        {items.map((item, index) => (
          <button
            key={getItemKey(item, index)}
            type="button"
            title={item.description}
            className={`slash-menu-item ${index === selectedIndex ? "active" : ""}`}
            onClick={() => command(item)}
            onMouseEnter={() => setSelection({ itemsKey, index })}
          >
            <span className="slash-menu-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="slash-menu-title">{item.title}</span>
            {item.shortcut ? (
              <span className="slash-menu-shortcut">{item.shortcut}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
