"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  hint?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export function ContextMenu({
  items,
  position,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!position) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleViewportChange = () => {
      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [onClose, position]);

  const menuStyle = useMemo(() => {
    if (!position || typeof window === "undefined") {
      return undefined;
    }

    const estimatedWidth = 250;
    const estimatedHeight = Math.max(180, items.length * 60 + 16);
    const left = Math.min(
      Math.max(12, position.x),
      window.innerWidth - estimatedWidth - 12
    );
    const top = Math.min(
      Math.max(12, position.y),
      window.innerHeight - estimatedHeight - 12
    );

    return {
      left,
      top,
    };
  }, [items.length, position]);

  if (!position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={menuStyle}
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={`${item.label}-${item.hint ?? ""}`}
          type="button"
          role="menuitem"
          className={`context-menu-item ${
            item.tone === "danger" ? "danger" : ""
          }`}
          disabled={item.disabled}
          onClick={async () => {
            onClose();
            await item.onSelect();
          }}
        >
          <span className="context-menu-label">{item.label}</span>
          {item.hint ? (
            <span className="context-menu-hint">{item.hint}</span>
          ) : null}
        </button>
      ))}
    </div>,
    document.body
  );
}
