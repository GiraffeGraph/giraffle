"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedAssignmentsCard } from "@/components/feeds/FeedAssignmentsCard";
import { SidebarIconPicker } from "@/components/sidebar/SidebarIconPicker";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { formatDate } from "@/lib/utils";
import { updateFolderAction } from "@/server/api/folders";

interface FolderDetailPageProps {
  folder: {
    id: string;
    name: string;
    icon: string | null;
    parentId: string | null;
    children: Array<{
      id: string;
      name: string;
      icon: string | null;
    }>;
    notes: Array<{
      id: string;
      title: string;
      icon: string | null;
      updatedAt: string;
    }>;
  };
  allFolders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  feedAssignments: Array<{
    id: string;
    title: string;
    kind: "suggestion" | "news";
    isSelected: boolean;
    refreshIntervalHours: number;
    itemCount: number;
  }>;
}

export function FolderDetailPage({
  folder,
  allFolders,
  feedAssignments,
}: FolderDetailPageProps) {
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport(900);
  const [folderIcon, setFolderIcon] = useState<string | null>(folder.icon);
  const [isCopyingLink, setIsCopyingLink] = useState(false);
  const [iconPickerPosition, setIconPickerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const breadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folder.id, allFolders),
    [allFolders, folder.id],
  );

  const handleOpenIconPicker = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setIconPickerPosition({
        x: rect.right - 28,
        y: rect.bottom + 8,
      });
    },
    [],
  );

  const closeIconPicker = useCallback(() => {
    setIconPickerPosition(null);
  }, []);

  const handleIconChange = useCallback(
    async (nextIcon: string | null) => {
      setFolderIcon(nextIcon);
      await updateFolderAction(folder.id, { icon: nextIcon });
      router.refresh();
    },
    [folder.id, router],
  );

  const handleCopyFolderLink = useCallback(async () => {
    setIsCopyingLink(true);
    await navigator.clipboard.writeText(
      `${window.location.origin}/folders/${folder.id}`,
    );
    window.setTimeout(() => setIsCopyingLink(false), 1200);
  }, [folder.id]);

  const topbarSidePadding = isMobileViewport ? "0 12px" : "0 16px";

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobileViewport ? "8px" : "12px",
          minHeight: "36px",
          padding: topbarSidePadding,
          borderBottom: "1px solid var(--md-sys-color-outline-variant)",
          fontSize: "12px",
          color: "var(--md-sys-color-on-surface-variant)",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--shell-main-bg, var(--md-sys-color-surface))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
            overflow: "hidden",
            flex: 1,
          }}
        >
          <button
            type="button"
            title="Klasör ikonunu değiştir"
            aria-label="Klasör ikonunu değiştir"
            onClick={handleOpenIconPicker}
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
            {isMobileViewport ? null : <span>İkon</span>}
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
                Çalışma alanı / Klasör
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
                {folder.name}
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
                onClick={() => router.push("/dashboard")}
              >
                Çalışma alanı
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
                        onClick={() => router.push(`/folders/${crumb.id}`)}
                      >
                        {crumb.name}
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            title="Klasör bağlantısını kopyala"
            aria-label="Klasör bağlantısını kopyala"
            onClick={() => void handleCopyFolderLink()}
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
        </div>
      </div>

      <div
        className="dashboard"
        style={{ paddingTop: isMobileViewport ? "20px" : "24px" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: isMobileViewport ? "column" : "row",
            alignItems: isMobileViewport ? "flex-start" : "center",
            gap: "14px",
            marginBottom: "24px",
          }}
        >
          <div
            className="dashboard-note-card-icon"
            style={{ minWidth: "52px", height: "52px", marginBottom: 0 }}
          >
            {renderStoredIcon(folderIcon, {
              fallback: (
                <span className="material-symbols-outlined" aria-hidden="true">
                  folder
                </span>
              ),
              materialClassName: "material-symbols-outlined",
              emojiStyle: { fontSize: "24px", lineHeight: 1 },
            })}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(1.9rem, 4vw, 2.8rem)",
                lineHeight: 1,
                letterSpacing: "-0.05em",
                color: "var(--text-primary)",
              }}
            >
              {folder.name}
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                color: "var(--text-secondary)",
                fontSize: "14px",
              }}
            >
              {folder.children.length} alt klasör · {folder.notes.length} not
            </p>
          </div>
        </div>

        {folder.children.length > 0 ? (
          <div className="folder-children-grid">
            {folder.children.map((childFolder) => (
              <Link
                key={childFolder.id}
                href={`/folders/${childFolder.id}`}
                className="dashboard-note-card"
              >
                <div className="dashboard-note-card-icon">
                  {renderStoredIcon(childFolder.icon, {
                    fallback: (
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        folder
                      </span>
                    ),
                    materialClassName: "material-symbols-outlined",
                    emojiStyle: { fontSize: "22px", lineHeight: 1 },
                  })}
                </div>
                <div className="dashboard-note-card-title">
                  {childFolder.name}
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        <div style={{ marginBottom: "24px" }}>
          <FeedAssignmentsCard
            title="Akış bağlantıları"
            description="Bu klasörü hangi öneri ve haber akışlarının besleyeceğini buradan seçebilirsin."
            assignments={feedAssignments}
            sourceType="folder"
            sourceId={folder.id}
          />
        </div>

        {folder.notes.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-text">Bu klasörde henüz not yok.</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {folder.notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="dashboard-note-card"
              >
                <div className="dashboard-note-card-icon">
                  {renderStoredIcon(note.icon, {
                    fallback: (
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        description
                      </span>
                    ),
                    materialClassName: "material-symbols-outlined",
                    emojiStyle: { fontSize: "22px", lineHeight: 1 },
                  })}
                </div>
                <div className="dashboard-note-card-title">{note.title}</div>
                <div className="dashboard-note-card-date">
                  {formatDate(new Date(note.updatedAt))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {iconPickerPosition ? (
        <SidebarIconPicker
          position={iconPickerPosition}
          currentIcon={folderIcon}
          onClose={closeIconPicker}
          onSelect={handleIconChange}
        />
      ) : null}
    </>
  );
}

function buildFolderBreadcrumbs(
  folderId: string,
  folders: Array<{ id: string; name: string; parentId: string | null }>,
) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const breadcrumbs: Array<{ id: string; name: string }> = [];

  let currentId: string | null = folderId;

  while (currentId) {
    const currentFolder = foldersById.get(currentId);

    if (!currentFolder) {
      break;
    }

    breadcrumbs.unshift({ id: currentFolder.id, name: currentFolder.name });
    currentId = currentFolder.parentId;
  }

  return breadcrumbs;
}
