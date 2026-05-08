"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderTopbar } from "@/components/folders/FolderTopbar";
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
}

export function FolderDetailPage({
  folder,
  allFolders,
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

  return (
    <>
      <FolderTopbar
        isMobileViewport={isMobileViewport}
        iconPickerPosition={iconPickerPosition}
        folderIcon={folderIcon}
        folderName={folder.name}
        breadcrumbs={breadcrumbs}
        isCopyingLink={isCopyingLink}
        onOpenIconPicker={handleOpenIconPicker}
        onGoDashboard={() => router.push("/spotter")}
        onSelectBreadcrumb={(folderId) => router.push(`/folders/${folderId}`)}
        onCopyFolderLink={handleCopyFolderLink}
      />

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
              {folder.children.length} subfolders · {folder.notes.length} notes
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

        {folder.notes.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-text">There are no notes in this folder yet.</p>
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
