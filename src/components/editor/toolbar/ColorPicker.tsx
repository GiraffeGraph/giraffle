"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ColorOption {
  name: string;
  color: string;
  /** CSS variable name for theme-awareness */
  cssVar?: string;
}

const TEXT_COLORS: ColorOption[] = [
  { name: "Default", color: "inherit" },
  { name: "Gray", color: "#787774" },
  { name: "Brown", color: "#9F6B53" },
  { name: "Orange", color: "#D9730D" },
  { name: "Yellow", color: "#CB912F" },
  { name: "Green", color: "#448361" },
  { name: "Blue", color: "#337EA9" },
  { name: "Purple", color: "#9065B0" },
  { name: "Pink", color: "#C14C8A" },
  { name: "Red", color: "#D44C47" },
];

const BG_COLORS: ColorOption[] = [
  { name: "Default", color: "transparent" },
  { name: "Gray", color: "rgba(120, 119, 116, 0.13)" },
  { name: "Brown", color: "rgba(159, 107, 83, 0.13)" },
  { name: "Orange", color: "rgba(217, 115, 13, 0.13)" },
  { name: "Yellow", color: "rgba(203, 145, 47, 0.13)" },
  { name: "Green", color: "rgba(68, 131, 97, 0.13)" },
  { name: "Blue", color: "rgba(51, 126, 169, 0.13)" },
  { name: "Purple", color: "rgba(144, 101, 176, 0.13)" },
  { name: "Pink", color: "rgba(193, 76, 138, 0.13)" },
  { name: "Red", color: "rgba(212, 76, 71, 0.13)" },
];

export type ColorPickerTab = "text" | "background" | "cell";

interface ColorPickerProps {
  currentTextColor?: string;
  currentHighlightColor?: string;
  currentCellColor?: string;
  allowCellColor?: boolean;
  defaultTab?: ColorPickerTab;
  onTextColor: (color: string | null) => void;
  onHighlightColor: (color: string | null) => void;
  onCellColor?: (color: string | null) => void;
  onClose: () => void;
  style?: CSSProperties;
}

export function ColorPicker({
  currentTextColor,
  currentHighlightColor,
  currentCellColor,
  allowCellColor,
  defaultTab = "text",
  onTextColor,
  onHighlightColor,
  onCellColor,
  onClose,
  style,
}: ColorPickerProps) {
  const [tab, setTab] = useState<ColorPickerTab>(defaultTab);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  return (
    <div
      ref={containerRef}
      className="color-picker"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="color-picker-tabs">
        <button
          type="button"
          className={`color-picker-tab ${tab === "text" ? "active" : ""}`}
          onClick={() => setTab("text")}
        >
          <span
            className="color-picker-tab-preview"
            style={{ color: "#D44C47" }}
          >
            A
          </span>
          Text Color
        </button>
        <button
          type="button"
          className={`color-picker-tab ${tab === "background" ? "active" : ""}`}
          onClick={() => setTab("background")}
        >
          <span
            className="color-picker-tab-preview"
            style={{
              backgroundColor: "rgba(203, 145, 47, 0.13)",
              borderRadius: "3px",
              padding: "0 3px",
            }}
          >
            A
          </span>
          Background
        </button>
        {allowCellColor ? (
          <button
            type="button"
            className={`color-picker-tab ${tab === "cell" ? "active" : ""}`}
            onClick={() => setTab("cell")}
          >
            <span
              className="color-picker-tab-preview"
              style={{
                backgroundColor: "rgba(51, 126, 169, 0.13)",
                borderRadius: "3px",
                padding: "0 3px",
              }}
            >
              田
            </span>
            Cell
          </button>
        ) : null}
      </div>

      <div className="color-picker-grid">
        {(tab === "text" ? TEXT_COLORS : BG_COLORS).map((option) => {
          let isActive = false;
          if (tab === "text") {
            isActive = currentTextColor === option.color || (option.color === "inherit" && !currentTextColor);
          } else if (tab === "background") {
            isActive = currentHighlightColor === option.color || (option.color === "transparent" && !currentHighlightColor);
          } else if (tab === "cell") {
            isActive = currentCellColor === option.color || (option.color === "transparent" && !currentCellColor);
          }

          return (
            <button
              key={option.name}
              type="button"
              className={`color-picker-swatch ${isActive ? "active" : ""}`}
              title={option.name}
              onClick={() => {
                if (tab === "text") {
                  onTextColor(option.color === "inherit" ? null : option.color);
                } else if (tab === "background") {
                  onHighlightColor(option.color === "transparent" ? null : option.color);
                } else if (tab === "cell" && onCellColor) {
                  onCellColor(option.color === "transparent" ? null : option.color);
                }
                onClose();
              }}
            >
              {tab === "text" ? (
                <span
                  className="color-picker-swatch-letter"
                  style={{
                    color:
                      option.color === "inherit"
                        ? "var(--text-primary)"
                        : option.color,
                  }}
                >
                  A
                </span>
              ) : (
                <span
                  className="color-picker-swatch-fill"
                  style={{
                    backgroundColor:
                      option.color === "transparent"
                        ? "var(--surface-glass)"
                        : option.color,
                  }}
                />
              )}
              <span className="color-picker-swatch-label">{option.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
