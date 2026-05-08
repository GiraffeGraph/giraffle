"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { RightRailHelpDrawer } from "@/components/right-rail/RightRailHelpDrawer";
import { GraphIcon } from "@/components/sidebar/GraphIcon";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { signOutAction } from "@/server/api/auth";
import { archiveNoteAction } from "@/server/api/notes";
import { isTmNoteDragData } from "@/components/tower-matrix/dnd";
import { isSidebarNoteDragData } from "@/components/sidebar/sidebar.types";

const NAV_ITEMS_TOP = [
  { path: "/search", icon: "\uE8B6", label: "Search" },
  { path: "/publish", icon: "\uE255", label: "Publish" },
  { path: "/trails", icon: "route", label: "Trails" },
] as const;

const NAV_ITEMS_BOTTOM = [
  { path: "/settings", icon: "\uE8B8", label: "Settings" },
  { path: "/account", icon: "\uF20B", label: "Account" },
] as const;

function isArchivableDragData(d: unknown) {
  return isTmNoteDragData(d) || isSidebarNoteDragData(d);
}

function ArchiveDropButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [dragInProgress, setDragInProgress] = useState(false);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => isArchivableDragData(source.data),
      onDragStart: () => setDragInProgress(true),
      onDrop: () => setDragInProgress(false),
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isArchivableDragData(source.data),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          let noteId: string | null = null;
          if (isTmNoteDragData(source.data)) noteId = source.data.id;
          else if (isSidebarNoteDragData(source.data))
            noteId = source.data.noteId;
          if (!noteId) return;
          void archiveNoteAction(noteId).then(() => router.refresh());
        },
      })
    );
  }, [router]);

  return (
    <button
      ref={ref}
      type="button"
      className={[
        "right-rail-btn",
        "right-rail-btn--archive",
        active ? "active" : "",
        dragInProgress ? "right-rail-btn--drop-target" : "",
        isOver ? "right-rail-btn--drop-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      aria-label="Archive"
      title={dragInProgress ? "Drop here to archive" : "Archive"}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: "18px", lineHeight: 1 }}
      >
        inventory_2
      </span>
      <span className="right-rail-btn-drop-label">Drop to archive</span>
    </button>
  );
}

export function RightRail({ appVersion }: { appVersion: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport(900);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <div className="right-rail">
        <button
          type="button"
          className={`right-rail-btn${pathname === "/graph" ? " active" : ""}`}
          onClick={() => router.push("/graph")}
          aria-label="Connection graph"
          title="Connection graph"
        >
          <GraphIcon size={18} />
        </button>

        <div className="right-rail-divider" />

        {NAV_ITEMS_TOP.map(({ path, icon, label }) => (
          <button
            key={path}
            type="button"
            className={`right-rail-btn${pathname === path || pathname.startsWith(`${path}/`) ? " active" : ""}`}
            onClick={() => router.push(path)}
            aria-label={label}
            title={label}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", lineHeight: 1 }}
            >
              {icon}
            </span>
          </button>
        ))}

        <ArchiveDropButton
          active={
            pathname === "/archive" || pathname.startsWith("/archive/")
          }
          onClick={() => router.push("/archive")}
        />

        {NAV_ITEMS_BOTTOM.map(({ path, icon, label }) => (
          <button
            key={path}
            type="button"
            className={`right-rail-btn${pathname === path || pathname.startsWith(`${path}/`) ? " active" : ""}`}
            onClick={() => router.push(path)}
            aria-label={label}
            title={label}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", lineHeight: 1 }}
            >
              {icon}
            </span>
          </button>
        ))}

        <div className="right-rail-bottom">
          <button
            type="button"
            className={`right-rail-btn${helpOpen ? " active" : ""}`}
            onClick={() => setHelpOpen((current) => !current)}
            aria-label="Help"
            title="Help"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", lineHeight: 1 }}
            >
              help
            </span>
          </button>
          {!isMobileViewport ? <ThemeSelector vertical /> : null}
          <button
            type="button"
            className="right-rail-btn right-rail-btn--signout"
            onClick={() => void signOutAction()}
            aria-label="Sign out"
            title="Sign out"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", lineHeight: 1 }}
            >
              logout
            </span>
          </button>
        </div>
      </div>

      <RightRailHelpDrawer
        appVersion={appVersion}
        pathname={pathname}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onNavigate={(href) => router.push(href)}
      />
    </>
  );
}
