"use client";

import type { RefObject } from "react";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { TopbarShell } from "@/components/ui/TopbarShell";

interface ParentPageOption {
  id: string;
  name: string;
}

interface SaveStatusMeta {
  label: string;
  color: string;
}

interface NoteTopbarProps {
  isMobileViewport: boolean;
  iconPickerPosition: { x: number; y: number } | null;
  noteIcon: string | null;
  currentParentId: string | null;
  currentParentLabel: string;
  isParentMenuOpen: boolean;
  parentOptions: ParentPageOption[];
  effectiveTitle: string;
  isPinned: boolean;
  isReadingMode: boolean;
  saveStatusMeta: SaveStatusMeta;
  parentMenuRef: RefObject<HTMLDivElement | null>;
  onOpenIconPicker: React.MouseEventHandler<HTMLButtonElement>;
  onToggleParentMenu: () => void;
  onSelectParent: (parentId: string | null) => void;
  onGoDashboard: () => void;
  onContextMenu: React.MouseEventHandler<HTMLElement>;
  onOpenContextMenuFromTrigger: React.MouseEventHandler<HTMLButtonElement>;
  onTogglePin: () => void;
  onToggleReadingMode: () => void;
}

export function NoteTopbar({
  isMobileViewport,
  iconPickerPosition,
  noteIcon,
  currentParentId,
  currentParentLabel,
  isParentMenuOpen,
  parentOptions,
  effectiveTitle,
  isPinned,
  isReadingMode,
  saveStatusMeta,
  parentMenuRef,
  onOpenIconPicker,
  onToggleParentMenu,
  onSelectParent,
  onGoDashboard,
  onContextMenu,
  onOpenContextMenuFromTrigger,
  onTogglePin,
  onToggleReadingMode,
}: NoteTopbarProps) {
  return (
    <TopbarShell
      className="note-topbar"
      onContextMenu={onContextMenu}
      left={
        <>
          <button
            type="button"
            className={`note-topbar-icon${iconPickerPosition ? " active" : ""}`}
            title="Change page icon"
            aria-label="Change page icon"
            onClick={onOpenIconPicker}
          >
            {renderStoredIcon(noteIcon, {
              fallback: (
                <span className="material-symbols-outlined" aria-hidden="true">
                  description
                </span>
              ),
              materialClassName: "material-symbols-outlined",
              emojiStyle: { fontSize: "16px", lineHeight: 1 },
            })}
          </button>

          {isMobileViewport ? null : (
            <>
              <button
                type="button"
                className="note-topbar-crumb"
                onClick={onGoDashboard}
              >
                Notes
              </button>
              <span className="note-topbar-separator">/</span>
            </>
          )}

          <div ref={parentMenuRef} className="note-location-menu">
            <button
              type="button"
              className="note-topbar-crumb note-location-trigger"
              onClick={onToggleParentMenu}
              aria-label="Move page"
              aria-haspopup="menu"
              aria-expanded={isParentMenuOpen}
            >
              <span className="note-location-label">
                {currentParentId ? currentParentLabel : "Workspace"}
              </span>
              <ChevronDownIcon />
            </button>

            {isParentMenuOpen ? (
              <div className="note-location-popover" role="menu">
                <div className="note-location-popover-label">Move page to</div>
                <ParentMenuItem
                  label="Workspace"
                  selected={currentParentId === null}
                  onClick={() => onSelectParent(null)}
                />
                {parentOptions.map((page) => (
                  <ParentMenuItem
                    key={page.id}
                    label={page.name}
                    selected={page.id === currentParentId}
                    onClick={() => onSelectParent(page.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <span className="note-topbar-separator">/</span>
          <span className="note-topbar-title">{effectiveTitle}</span>
        </>
      }
      right={
        <>
          {!isMobileViewport && saveStatusMeta.label !== "Saved" ? (
            <span
              className="note-save-status"
              style={{ color: saveStatusMeta.color }}
            >
              <span
                className="note-save-status-dot"
                style={{ background: saveStatusMeta.color }}
                aria-hidden="true"
              />
              {saveStatusMeta.label}
            </span>
          ) : null}

          {isMobileViewport ? null : (
            <>
              <TopbarIconButton
                icon="push_pin"
                label={isPinned ? "Unpin" : "Pin"}
                active={isPinned}
                onClick={onTogglePin}
              />
              <TopbarIconButton
                icon="menu_book"
                label={isReadingMode ? "Exit reading mode" : "Reading mode"}
                active={isReadingMode}
                onClick={onToggleReadingMode}
              />
            </>
          )}

          <TopbarIconButton
            icon="more_horiz"
            label="Page actions"
            onClick={onOpenContextMenuFromTrigger}
          />
        </>
      }
    />
  );
}

function ParentMenuItem({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`note-location-option${selected ? " selected" : ""}`}
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        description
      </span>
      <span>{label}</span>
      {selected ? (
        <span className="material-symbols-outlined note-location-check" aria-hidden="true">
          check
        </span>
      ) : null}
    </button>
  );
}

function TopbarIconButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement> | (() => void);
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`note-topbar-action${active ? " active" : ""}`}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4.22 6.47 7.47 9.72a.75.75 0 0 0 1.06 0l3.25-3.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
