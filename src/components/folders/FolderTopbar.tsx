"use client";

import { TopbarShell } from "@/components/ui/TopbarShell";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";

interface FolderBreadcrumb {
  id: string;
  name: string;
}

interface FolderTopbarProps {
  isMobileViewport: boolean;
  iconPickerPosition: { x: number; y: number } | null;
  folderIcon: string | null;
  folderName: string;
  breadcrumbs: FolderBreadcrumb[];
  isCopyingLink: boolean;
  onOpenIconPicker: React.MouseEventHandler<HTMLButtonElement>;
  onGoDashboard: () => void;
  onSelectBreadcrumb: (folderId: string) => void;
  onCopyFolderLink: () => void | Promise<void>;
}

export function FolderTopbar({
  isMobileViewport,
  iconPickerPosition,
  folderIcon,
  folderName,
  breadcrumbs,
  isCopyingLink,
  onOpenIconPicker,
  onGoDashboard,
  onSelectBreadcrumb,
  onCopyFolderLink,
}: FolderTopbarProps) {
  return (
    <TopbarShell
      left={
        <>
          <button
            type="button"
            title="Change folder icon"
            aria-label="Change folder icon"
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
            {renderStoredIcon(folderIcon, {
              fallback: (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px" }}
                  aria-hidden="true"
                >
                  folder
                </span>
              ),
              materialClassName: "material-symbols-outlined",
              emojiStyle: { fontSize: "16px", lineHeight: 1 },
            })}
            {isMobileViewport ? null : <span>Icon</span>}
          </button>

          {isMobileViewport ? (
            <div style={{ display: "grid", gap: "2px", minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontSize: "11px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Workspace / Folder
              </span>
              <span
                style={{
                  color: "var(--md-sys-color-on-surface)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {folderName}
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
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return (
                  <div
                    key={crumb.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ opacity: 0.4 }}>/</span>
                    {isLast ? (
                      <span
                        style={{
                          color: "var(--md-sys-color-on-surface)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "260px",
                        }}
                      >
                        {crumb.name}
                      </span>
                    ) : (
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
                        onClick={() => onSelectBreadcrumb(crumb.id)}
                      >
                        {crumb.name}
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      }
      right={
        <button
          type="button"
          title="Copy folder link"
          aria-label="Copy folder link"
          onClick={() => void onCopyFolderLink()}
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "999px",
            border: "1px solid var(--md-sys-color-outline-variant)",
            background: isCopyingLink
              ? "var(--md-sys-color-secondary-container)"
              : "var(--md-sys-color-surface-container-highest)",
            color: isCopyingLink
              ? "var(--md-sys-color-on-secondary-container)"
              : "var(--md-sys-color-on-surface-variant)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px" }}
            aria-hidden="true"
          >
            {isCopyingLink ? "check" : "link"}
          </span>
        </button>
      }
    />
  );
}
