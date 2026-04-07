"use client";

import dynamic from "next/dynamic";
import {
  EmojiStyle,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import type {
  EmojiClickData,
} from "emoji-picker-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  decodeStoredIcon,
  encodeMaterialSymbol,
  renderStoredIcon,
  SIDEBAR_ICON_MATERIAL_SYMBOLS,
} from "./sidebar-icon-utils";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

const RECENT_ICONS_STORAGE_KEY = "giraffle.sidebar.icon-picker.recent";
const MAX_RECENT_ICONS = 16;

type PickerTab = "emoji" | "icons";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

type SidebarIconPickerProps = {
  position: { x: number; y: number };
  currentIcon: string | null;
  onClose: () => void;
  onSelect: (icon: string | null) => void | Promise<void>;
};

export function SidebarIconPicker({
  position,
  currentIcon,
  onClose,
  onSelect,
}: SidebarIconPickerProps) {
  const initialTab: PickerTab = decodeStoredIcon(currentIcon).kind === "material" ? "icons" : "emoji";
  const [activeTab, setActiveTab] = useState<PickerTab>(initialTab);
  const [query, setQuery] = useState("");
  const [recentIcons, setRecentIcons] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerTheme, setPickerTheme] = useState<Theme>(Theme.LIGHT);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_ICONS_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        setRecentIcons(parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT_ICONS));
      }
    } catch {
      setRecentIcons([]);
    }
  }, []);

  useEffect(() => {
    const resolveTheme = () => {
      const colorScheme = window.getComputedStyle(document.documentElement).colorScheme;
      setPickerTheme(colorScheme === "dark" ? Theme.DARK : Theme.LIGHT);
    };

    resolveTheme();

    const observer = new MutationObserver(resolveTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });

    return () => observer.disconnect();
  }, []);

  const panelStyle = useMemo(() => {
    if (typeof window === "undefined") {
      return { left: position.x, top: position.y };
    }

    const width = 520;
    const height = 520;
    const left = Math.min(Math.max(12, position.x), window.innerWidth - width - 12);
    const top = Math.min(Math.max(12, position.y), window.innerHeight - height - 12);
    return { left, top };
  }, [position.x, position.y]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRecentIcons = recentIcons.filter(
    (icon) => decodeStoredIcon(icon).kind === "material"
  );

  const filteredMaterialIcons = useMemo(() => {
    if (activeTab !== "icons") return [];
    return SIDEBAR_ICON_MATERIAL_SYMBOLS.filter((icon) => icon.toLowerCase().includes(normalizedQuery));
  }, [activeTab, normalizedQuery]);

  const commitSelection = async (icon: string | null) => {
    if (isSaving) return;

    setIsSaving(true);

    if (icon) {
      const nextRecent = [icon, ...recentIcons.filter((item) => item !== icon)].slice(0, MAX_RECENT_ICONS);
      setRecentIcons(nextRecent);
      window.localStorage.setItem(RECENT_ICONS_STORAGE_KEY, JSON.stringify(nextRecent));
    }

    try {
      onClose();
      await onSelect(icon);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmojiClick = async (emojiData: EmojiClickData) => {
    await commitSelection(emojiData.emoji);
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="icon-picker-overlay" onClick={onClose}>
      <div
        className="icon-picker"
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="icon-picker-topbar">
          <div className="icon-picker-tabs" role="tablist" aria-label="Ikon sekmeleri">
            {([
              { id: "emoji", label: "Emoji" },
              { id: "icons", label: "Icons" },
            ] as Array<{ id: PickerTab; label: string }>).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`icon-picker-tab${activeTab === tab.id ? " active" : ""}`}
                aria-selected={activeTab === tab.id}
                disabled={isSaving}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-picker-remove"
            disabled={isSaving}
            onClick={() => void commitSelection(null)}
          >
            {isSaving ? "Saving..." : "Remove"}
          </button>
        </div>

        {activeTab === "emoji" ? (
          <div className="icon-picker-emoji-shell">
            <EmojiPicker
              onEmojiClick={(emojiData) => void handleEmojiClick(emojiData)}
              autoFocusSearch
              searchPlaceholder="Emoji ara"
              suggestedEmojisMode={SuggestionMode.RECENT}
              emojiStyle={EmojiStyle.NATIVE}
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
              theme={pickerTheme}
              width="100%"
              height="100%"
              className="icon-picker-emoji-panel"
            />
          </div>
        ) : (
          <>
            <div className="icon-picker-toolbar">
              <label className="icon-picker-search">
                <SearchIcon />
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  type="text"
                  value={query}
                  disabled={isSaving}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Material Symbols filtrele..."
                />
              </label>
            </div>

            <div className="icon-picker-scroll">
              {visibleRecentIcons.length > 0 ? (
                <section className="icon-picker-section">
                  <div className="icon-picker-section-title">Recent</div>
                  <div className="icon-picker-grid">
                    {visibleRecentIcons.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        className={`icon-picker-choice${icon === currentIcon ? " active" : ""}`}
                        disabled={isSaving}
                        onClick={() => void commitSelection(icon)}
                        title={decodeStoredIcon(icon).value ?? "icon"}
                      >
                        {renderStoredIcon(icon, {
                          materialClassName: "material-symbols-outlined",
                          emojiStyle: { fontSize: "26px", lineHeight: 1 },
                        })}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="icon-picker-section">
                <div className="icon-picker-section-title">Icons</div>
                <div className="icon-picker-grid">
                  {filteredMaterialIcons.map((icon) => {
                    const storedIcon = encodeMaterialSymbol(icon);
                    return (
                      <button
                        key={icon}
                        type="button"
                        className={`icon-picker-choice icon-picker-choice--material${storedIcon === currentIcon ? " active" : ""}`}
                        disabled={isSaving}
                        onClick={() => void commitSelection(storedIcon)}
                        title={icon}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

              {filteredMaterialIcons.length === 0 ? (
                <div className="icon-picker-empty">Bu filtre icin sonuc yok.</div>
              ) : null}
            </>
          )}
      </div>
    </div>,
    document.body
  );
}
