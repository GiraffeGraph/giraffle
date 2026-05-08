"use client";

import type { RefObject } from "react";
import { TopbarShell } from "@/components/ui/TopbarShell";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";

interface FolderOption {
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
  currentFolderId: string | null;
  currentFolderLabel: string;
  isFolderMenuOpen: boolean;
  folderOptions: FolderOption[];
  effectiveTitle: string;
  isPublished: boolean;
  isPinned: boolean;
  isReadingMode: boolean;
  isPublishPopoverOpen: boolean;
  saveStatusMeta: SaveStatusMeta;
  folderMenuRef: RefObject<HTMLDivElement | null>;
  onOpenIconPicker: React.MouseEventHandler<HTMLButtonElement>;
  onToggleFolderMenu: () => void;
  onSelectFolder: (folderId: string | null) => void;
  onGoDashboard: () => void;
  onContextMenu: React.MouseEventHandler<HTMLElement>;
  onOpenContextMenuFromTrigger: React.MouseEventHandler<HTMLButtonElement>;
  onOpenPublishPopover: React.MouseEventHandler<HTMLButtonElement>;
  onTogglePin: () => void;
  onToggleReadingMode: () => void;
}

export function NoteTopbar({
  isMobileViewport,
  iconPickerPosition,
  noteIcon,
  currentFolderId,
  currentFolderLabel,
  isFolderMenuOpen,
  folderOptions,
  effectiveTitle,
  isPublished,
  isPinned,
  isReadingMode,
  isPublishPopoverOpen,
  saveStatusMeta,
  folderMenuRef,
  onOpenIconPicker,
  onToggleFolderMenu,
  onSelectFolder,
  onGoDashboard,
  onContextMenu,
  onOpenContextMenuFromTrigger,
  onOpenPublishPopover,
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
            title="Change note icon"
            aria-label="Change note icon"
            onClick={onOpenIconPicker}
            style={{
              background: iconPickerPosition
                ? "var(--md-sys-color-secondary-container)"
                : "var(--md-sys-color-surface-container-highest)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              color: iconPickerPosition
                ? "var(--md-sys-color-on-secondary-container)"
                : "var(--md-sys-color-on-surface-variant)",
              cursor: "pointer",
              padding: isMobileViewport ? "4px" : "4px 8px",
              borderRadius: "999px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              minHeight: "26px",
              minWidth: "26px",
              lineHeight: 1,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {renderStoredIcon(noteIcon, {
              fallback: (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px" }}
                  aria-hidden="true"
                >
                  description
                </span>
              ),
              materialClassName: "material-symbols-outlined",
              emojiStyle: { fontSize: "16px", lineHeight: 1 },
            })}
            {isMobileViewport ? null : <span>Icon</span>}
          </button>

          {isMobileViewport ? (
            <div style={{ display: "grid", gap: "2px", minWidth: 0, flex: 1 }}>
              <div
                ref={folderMenuRef}
                style={{ position: "relative", minWidth: 0 }}
              >
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    borderRadius: "4px",
                    fontSize: "11px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                    maxWidth: "100%",
                    minWidth: 0,
                  }}
                  onClick={onToggleFolderMenu}
                  aria-haspopup="menu"
                  aria-expanded={isFolderMenuOpen}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {currentFolderId ? currentFolderLabel : "Root folder"}
                  </span>
                  <ChevronDownIcon />
                </button>
                {isFolderMenuOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      background: "var(--md-sys-color-surface-container-high)",
                      borderRadius: "10px",
                      padding: "6px",
                      boxShadow: "var(--md-sys-elevation-3)",
                      zIndex: 100,
                      minWidth: "180px",
                      maxWidth: "min(280px, calc(100vw - 32px))",
                    }}
                    role="menu"
                  >
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 10px",
                        background:
                          currentFolderId === null
                            ? "var(--md-sys-color-secondary-container)"
                            : "transparent",
                        color:
                          currentFolderId === null
                            ? "var(--md-sys-color-on-secondary-container)"
                            : "var(--md-sys-color-on-surface)",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                      onClick={() => onSelectFolder(null)}
                    >
                      Root folder
                    </button>
                    {folderOptions.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 10px",
                          background:
                            folder.id === currentFolderId
                              ? "var(--md-sys-color-secondary-container)"
                              : "transparent",
                          color:
                            folder.id === currentFolderId
                              ? "var(--md-sys-color-on-secondary-container)"
                              : "var(--md-sys-color-on-surface)",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginTop: "2px",
                          fontSize: "12px",
                        }}
                        onClick={() => onSelectFolder(folder.id)}
                      >
                        {folder.name.split(" / ").at(-1) ?? folder.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <span
                style={{
                  color: "var(--md-sys-color-on-surface)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {effectiveTitle}
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
                onClick={onGoDashboard}
              >
                Workspace
              </button>
              <span style={{ opacity: 0.4 }}>/</span>
              <div ref={folderMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "2px",
                    whiteSpace: "nowrap",
                  }}
                  onClick={onToggleFolderMenu}
                  aria-haspopup="menu"
                  aria-expanded={isFolderMenuOpen}
                >
                  <span>
                    {currentFolderId ? currentFolderLabel : "Root folder"}
                  </span>
                  <ChevronDownIcon />
                </button>
                {isFolderMenuOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      background: "var(--md-sys-color-surface-container-high)",
                      borderRadius: "10px",
                      padding: "6px",
                      boxShadow: "var(--md-sys-elevation-3)",
                      zIndex: 100,
                      minWidth: "180px",
                    }}
                    role="menu"
                  >
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 10px",
                        background:
                          currentFolderId === null
                            ? "var(--md-sys-color-secondary-container)"
                            : "transparent",
                        color:
                          currentFolderId === null
                            ? "var(--md-sys-color-on-secondary-container)"
                            : "var(--md-sys-color-on-surface)",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                      onClick={() => onSelectFolder(null)}
                    >
                      Root folder
                    </button>
                    {folderOptions.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 10px",
                          background:
                            folder.id === currentFolderId
                              ? "var(--md-sys-color-secondary-container)"
                              : "transparent",
                          color:
                            folder.id === currentFolderId
                              ? "var(--md-sys-color-on-secondary-container)"
                              : "var(--md-sys-color-on-surface)",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginTop: "2px",
                          fontSize: "12px",
                        }}
                        onClick={() => onSelectFolder(folder.id)}
                      >
                        {folder.name.split(" / ").at(-1) ?? folder.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <span style={{ opacity: 0.4 }}>/</span>
              <span
                style={{
                  color: "var(--md-sys-color-on-surface)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "240px",
                }}
              >
                {effectiveTitle}
              </span>
            </>
          )}
        </>
      }
      right={
        <>
          {isMobileViewport ? null : (
            <span
              style={{
                fontSize: "11px",
                color: saveStatusMeta.color,
                whiteSpace: "nowrap",
              }}
            >
              {saveStatusMeta.label}
            </span>
          )}
          {isMobileViewport ? (
            <button
              type="button"
              title="Note actions"
              aria-label="Note actions"
              onClick={onOpenContextMenuFromTrigger}
              style={{
                background: "none",
                border: "none",
                color: "var(--md-sys-color-on-surface-variant)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                lineHeight: 1,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px" }}
              >
                more_horiz
              </span>
            </button>
          ) : (
            <>
              <TopbarIconButton
                icon="share"
                label={
                  isPublishPopoverOpen
                    ? "Close publish settings"
                    : isPublished
                      ? "Publish settings"
                      : "Publish"
                }
                active={isPublishPopoverOpen || isPublished}
                onClick={onOpenPublishPopover}
              />
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
          {isMobileViewport ? null : (
            <button
              type="button"
              title="More actions"
              aria-label="More actions"
              onClick={onOpenContextMenuFromTrigger}
              style={{
                background: "none",
                border: "none",
                color: "var(--md-sys-color-on-surface-variant)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                lineHeight: 1,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px" }}
              >
                more_horiz
              </span>
            </button>
          )}
        </>
      }
    />
  );
}

interface TopbarIconButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement> | (() => void);
}

function TopbarIconButton({
  icon,
  label,
  active = false,
  onClick,
}: TopbarIconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      style={{
        background: active
          ? "var(--md-sys-color-secondary-container)"
          : "none",
        border: "none",
        color: active
          ? "var(--md-sys-color-on-secondary-container)"
          : "var(--md-sys-color-on-surface-variant)",
        cursor: "pointer",
        padding: "4px",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        lineHeight: 1,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: "18px" }}
      >
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
