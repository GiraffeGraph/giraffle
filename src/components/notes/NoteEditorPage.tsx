"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import type { BacklinkResult } from "@/domain/link/link.types";
import { DEFAULT_NOTE_TITLE } from "@/domain/note/note.types";
import type { NoteReference, TiptapDocument } from "@/domain/note/note.types";
import {
  moveNoteAction,
  archiveNoteAction,
  updateNoteAction,
  createNoteFromWikilinkAction,
  findNoteByTitleAction,
  getNoteExportAction,
  saveNoteContentAction,
  searchNotesByTitleAction,
} from "@/server/api/notes";
import {
  applyProposalAction,
  rejectProposalAction,
} from "@/server/api/proposals";
import { createMapFromNoteAction } from "@/server/api/canvas";
import { queueLocalMutation, resolveLocalMutation } from "@/lib/local-sync";

interface NoteEditorPageProps {
  note: {
    id: string;
    title: string;
    slug: string | null;
    icon: string | null;
    folderId: string | null;
    isPinned: boolean;
    isPublished: boolean;
    tags: string[];
    document: TiptapDocument;
  };
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  backlinks: BacklinkResult[];
  proposals: Array<{
    id: string;
    title: string;
    summary: string | null;
    status: string;
    createdAt: string;
  }>;
}

export function NoteEditorPage({
  note,
  folders,
  backlinks,
  proposals,
}: NoteEditorPageProps) {
  const [title, setTitle] = useState(note.title);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    note.folderId
  );
  const [slug, setSlug] = useState(note.slug);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [isPublished, setIsPublished] = useState(note.isPublished);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [isMetaPanelOpen, setIsMetaPanelOpen] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const folderOptions = useMemo(
    () =>
      folders.map((folder) => ({
        id: folder.id,
        name: buildFolderLabel(folder, folders),
      })),
    [folders]
  );

  const currentFolderLabel = useMemo(
    () =>
      folderOptions.find((folder) => folder.id === currentFolderId)?.name ??
      "Çalışma alanı",
    [currentFolderId, folderOptions]
  );

  const effectiveTitle = title.trim() || DEFAULT_NOTE_TITLE;

  useEffect(() => {
    if (!isFolderMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!folderMenuRef.current?.contains(event.target as Node)) {
        setIsFolderMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFolderMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFolderMenuOpen]);

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTitle(newTitle);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "update-title",
        payload: { title: newTitle || DEFAULT_NOTE_TITLE },
      });
      await updateNoteAction(note.id, { title: newTitle || DEFAULT_NOTE_TITLE });
      resolveLocalMutation(mutationId);
    },
    [note.id]
  );

  const handleFolderChange = useCallback(
    async (nextFolderId: string) => {
      const normalizedFolderId = nextFolderId || null;
      setCurrentFolderId(normalizedFolderId);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "move-folder",
        payload: { folderId: normalizedFolderId },
      });
      await updateNoteAction(note.id, { folderId: normalizedFolderId });
      resolveLocalMutation(mutationId);
    },
    [note.id]
  );

  const handleSelectFolder = useCallback(
    async (nextFolderId: string | null) => {
      setIsFolderMenuOpen(false);
      await handleFolderChange(nextFolderId ?? "");
    },
    [handleFolderChange]
  );

  const handlePublishToggle = useCallback(async () => {
    const nextValue = !isPublished;
    setIsPublished(nextValue);
    const mutationId = queueLocalMutation({
      entityType: "note",
      entityId: note.id,
      actionType: nextValue ? "publish" : "unpublish",
    });
    await updateNoteAction(note.id, { isPublished: nextValue });
    resolveLocalMutation(mutationId);
    router.refresh();
  }, [isPublished, note.id, router]);

  const handlePinToggle = useCallback(async () => {
    const nextValue = !isPinned;
    setIsPinned(nextValue);
    const mutationId = queueLocalMutation({
      entityType: "note",
      entityId: note.id,
      actionType: nextValue ? "pin" : "unpin",
    });
    await updateNoteAction(note.id, { isPinned: nextValue });
    resolveLocalMutation(mutationId);
    router.refresh();
  }, [isPinned, note.id, router]);

  const handleMoveNote = useCallback(
    async (direction: "up" | "down") => {
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: `move-${direction}`,
      });
      await moveNoteAction(note.id, direction);
      resolveLocalMutation(mutationId);
      router.refresh();
    },
    [note.id, router]
  );

  const handleSlugChange = useCallback(
    async (nextSlug: string) => {
      const normalizedSlug = nextSlug.trim() || null;
      setSlug(normalizedSlug);
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "update-slug",
        payload: { slug: normalizedSlug },
      });
      await updateNoteAction(note.id, { slug: normalizedSlug });
      resolveLocalMutation(mutationId);
      router.refresh();
    },
    [note.id, router]
  );

  const handleApplyProposal = useCallback(
    async (proposalId: string) => {
      await applyProposalAction(proposalId, note.id);
      router.refresh();
    },
    [note.id, router]
  );

  const handleRejectProposal = useCallback(
    async (proposalId: string) => {
      await rejectProposalAction(proposalId, note.id);
      router.refresh();
    },
    [note.id, router]
  );

  const handleCopyExport = useCallback(
    (format: "markdown" | "mdx") => {
      startExportTransition(async () => {
        const content = await getNoteExportAction(note.id, format);
        await navigator.clipboard.writeText(content);
      });
    },
    [note.id]
  );

  const handleOpenPublishedPage = useCallback(() => {
    if (!isPublished || !slug) {
      return;
    }

    window.open(`/published/${slug}`, "_blank", "noopener,noreferrer");
  }, [isPublished, slug]);

  const handleCopyNoteLink = useCallback(async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/notes/${note.id}`
    );
  }, [note.id]);

  const handleArchiveNote = useCallback(async () => {
    await archiveNoteAction(note.id);
    router.push("/dashboard");
  }, [note.id, router]);

  const handleOpenInCanvas = useCallback(async () => {
    try {
      const canvasId = await createMapFromNoteAction(note.id);
      router.push(`/canvas/${canvasId}`);
    } catch (err) {
      console.error("Failed to open canvas:", err);
    }
  }, [note.id, router]);

  const handleSave = useCallback(
    async (content: TiptapDocument) => {
      const mutationId = queueLocalMutation({
        entityType: "note",
        entityId: note.id,
        actionType: "save-document",
        payload: {
          blockCount: content.content.length,
        },
      });
      await saveNoteContentAction(note.id, content);
      resolveLocalMutation(mutationId);
    },
    [note.id]
  );

  const handleSearchWikilinks = useCallback(async (query: string) => {
    return searchNotesByTitleAction(query);
  }, []);

  const handleResolveWikilink = useCallback(async (target: string) => {
    return findNoteByTitleAction(target);
  }, []);

  const handleCreateWikilink = useCallback(
    async (target: string): Promise<NoteReference> => {
      return createNoteFromWikilinkAction(target, currentFolderId);
    },
    [currentFolderId]
  );

  const handleNavigateToNote = useCallback(
    (noteId: string) => {
      router.push(`/notes/${noteId}`);
    },
    [router]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const toggleMetaPanel = useCallback(() => {
    setIsMetaPanelOpen((currentValue) => !currentValue);
  }, []);

  const openContextMenuAtPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      setContextMenuPosition({
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const openContextMenuFromTrigger = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setContextMenuPosition({
        x: rect.right - 14,
        y: rect.bottom + 8,
      });
    },
    []
  );

  const noteContextItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: isPinned ? "Sabitlemeyi kaldır" : "Sabitle",
        hint: "Not sırasında üstte tut veya serbest bırak",
        onSelect: handlePinToggle,
      },
      {
        label: isPublished ? "Yayımdan kaldır" : "Yayımla",
        hint: "Notun yayın durumunu değiştir",
        onSelect: handlePublishToggle,
      },
      {
        label: isMetaPanelOpen ? "Sayfa ayarlarını gizle" : "Sayfa ayarları",
        hint: "Yayın adresi ve ikincil seçenekleri aç",
        onSelect: toggleMetaPanel,
      },
      {
        label: "Kanvasta Aç",
        hint: "Bu notu merkez alarak uzamsal haritasını çıkar",
        onSelect: handleOpenInCanvas,
      },
      {
        label: "Yukarı taşı",
        hint: "Bulunduğu listede bir adım yukarı al",
        onSelect: () => handleMoveNote("up"),
      },
      {
        label: "Aşağı taşı",
        hint: "Bulunduğu listede bir adım aşağı al",
        onSelect: () => handleMoveNote("down"),
      },
      {
        label: "Not bağlantısını kopyala",
        hint: "Dahili not adresini panoya kopyala",
        onSelect: handleCopyNoteLink,
      },
      {
        label: "Markdown kopyala",
        hint: "Dışa aktarılan Markdown sürümünü kopyala",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("markdown"),
      },
      {
        label: "MDX kopyala",
        hint: "Dışa aktarılan MDX sürümünü kopyala",
        disabled: isExportPending,
        onSelect: () => handleCopyExport("mdx"),
      },
      {
        label: "Yayımdaki sayfayı aç",
        hint: "Genel görünümü yeni sekmede aç",
        disabled: !isPublished,
        onSelect: handleOpenPublishedPage,
      },
      {
        label: "Arşive taşı",
        hint: "Notu aktif listelerden kaldır",
        tone: "danger",
        onSelect: handleArchiveNote,
      },
    ],
    [
      handleArchiveNote,
      handleCopyExport,
      handleCopyNoteLink,
      handleMoveNote,
      handleOpenInCanvas,
      handleOpenPublishedPage,
      handlePinToggle,
      handlePublishToggle,
      isExportPending,
      isMetaPanelOpen,
      isPinned,
      isPublished,
      toggleMetaPanel,
    ]
  );

  return (
    <div className="note-page">
      <div className="note-header" onContextMenu={openContextMenuAtPointer}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid var(--md-sys-color-outline-variant)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--md-sys-typescale-body-medium-size)", color: "var(--md-sys-color-on-surface-variant)" }}>
            <button
              type="button"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "4px 8px", borderRadius: "8px" }}
              onClick={() => router.push("/dashboard")}
            >
              Çalışma alanı
            </button>
            <span>/</span>
            <div className="note-folder-picker" ref={folderMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                style={{ background: "var(--md-sys-color-surface-container-low)", border: "1px solid var(--md-sys-color-outline)", color: "var(--md-sys-color-on-surface)", cursor: "pointer", padding: "4px 12px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "4px", fontSize: "14px" }}
                onClick={() =>
                  setIsFolderMenuOpen((currentValue) => !currentValue)
                }
                aria-haspopup="menu"
                aria-expanded={isFolderMenuOpen}
              >
                <span>{currentFolderId ? currentFolderLabel : "Kök klasör"}</span>
                <ChevronDownIcon />
              </button>

              {isFolderMenuOpen ? (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "8px", background: "var(--md-sys-color-surface-container-high)", borderRadius: "12px", padding: "8px", boxShadow: "var(--md-sys-elevation-3)", zIndex: 100, minWidth: "200px" }} role="menu">
                  <button
                    type="button"
                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: currentFolderId === null ? "var(--md-sys-color-secondary-container)" : "transparent", color: currentFolderId === null ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface)", border: "none", borderRadius: "8px", cursor: "pointer", display: "flex", flexDirection: "column" }}
                    onClick={() => void handleSelectFolder(null)}
                  >
                    <span style={{ fontWeight: "bold" }}>Kök klasör</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>Çalışma alanı</span>
                  </button>

                  {folderOptions.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: folder.id === currentFolderId ? "var(--md-sys-color-secondary-container)" : "transparent", color: folder.id === currentFolderId ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface)", border: "none", borderRadius: "8px", cursor: "pointer", display: "flex", flexDirection: "column", marginTop: "4px" }}
                      onClick={() => void handleSelectFolder(folder.id)}
                    >
                      <span style={{ fontWeight: "bold" }}>
                        {folder.name.split(" / ").at(-1) ?? folder.name}
                      </span>
                      <span style={{ fontSize: "12px", opacity: 0.8 }}>{folder.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <span>/</span>
            <span style={{ color: "var(--md-sys-color-on-surface)", fontWeight: "500" }}>{effectiveTitle}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Button
              variant={isPinned ? "filled" : "tonal"}
              icon
              onClick={() => void handlePinToggle()}
              aria-label={isPinned ? "Sabitlemeyi kaldır" : "Sabitle"}
              aria-pressed={isPinned}
              title={isPinned ? "Sabitlemeyi kaldır" : "Sabitle"}
            >
              <PinIcon />
            </Button>
            <Button
              variant="filled"
              onClick={() => void handlePublishToggle()}
            >
              {isPublished ? "Yayımdan kaldır" : "Yayımla"}
            </Button>
            <Button
              variant="text"
              icon
              onClick={openContextMenuFromTrigger}
              aria-label="Not menüsünü aç"
              aria-haspopup="menu"
            >
              ...
            </Button>
          </div>
        </div>

        <div style={{ padding: "32px 32px 0", maxWidth: "800px", margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "var(--md-sys-shape-full)", backgroundColor: isPublished ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline)" }} />
              <span style={{ fontSize: "var(--md-sys-typescale-label-medium-size)", fontWeight: "var(--md-sys-typescale-label-medium-weight)", color: "var(--md-sys-color-on-surface-variant)" }}>
                {isPublished ? "Yayında" : "Taslak"}
              </span>
              {isPinned ? (
                <span style={{ fontSize: "var(--md-sys-typescale-label-small-size)", padding: "2px 6px", background: "var(--md-sys-color-surface-container-high)", borderRadius: "4px", color: "var(--md-sys-color-on-surface-variant)" }}>Pinli</span>
              ) : null}
            </div>

            <input
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder={DEFAULT_NOTE_TITLE}
              spellCheck={false}
              style={{ fontSize: "var(--md-sys-typescale-display-small-size)", fontWeight: "var(--md-sys-typescale-display-small-weight)", color: "var(--md-sys-color-on-background)", border: "none", background: "transparent", outline: "none", width: "100%", padding: 0 }}
            />

            {note.tags.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {note.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    style={{ background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)", border: "none", padding: "4px 12px", borderRadius: "8px", fontSize: "var(--md-sys-typescale-label-large-size)", cursor: "pointer" }}
                    onClick={() => router.push(`/tags/${tag}`)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            ) : null}

            {isMetaPanelOpen ? (
              <Card variant="outlined" style={{ marginTop: "16px" }}>
                <CardContent>
                  <div className="md-text-field md-text-field--outlined md-text-field--has-value" style={{ width: "100%" }}>
                    <div className="md-text-field-container">
                      <input
                        className="md-text-field-input"
                        value={slug ?? ""}
                        onChange={(event) => setSlug(event.target.value)}
                        onBlur={(event) => void handleSlugChange(event.target.value)}
                        placeholder="yayin-adresi"
                        spellCheck={false}
                      />
                      <span className="md-text-field-label">Yayın Adresi</span>
                    </div>
                  </div>
                  <p style={{ marginTop: "8px", fontSize: "var(--md-sys-typescale-body-small-size)", color: "var(--md-sys-color-on-surface-variant)" }}>
                    {slug?.trim()
                      ? `Yayın yolu: /published/${slug}`
                      : "Yayımlandığında otomatik bir adres oluşturulur."}
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 32px 32px", minHeight: "60vh" }}>
        <Editor
          noteId={note.id}
          initialContent={note.document}
          onSave={handleSave}
          searchWikilinkNotes={handleSearchWikilinks}
          resolveWikilinkNote={handleResolveWikilink}
          createWikilinkNote={handleCreateWikilink}
          onNavigateToNote={handleNavigateToNote}
        />
      </div>

      {backlinks.length > 0 ? (
        <div style={{ maxWidth: "800px", margin: "48px auto 0", padding: "0 32px" }}>
          <Card variant="outlined">
            <CardHeader>
              <CardTitle style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Bag</span>
                Geri bağlantılar ({backlinks.length})
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: 0 }}>
              <ul className="md-list">
                {backlinks.map((backlink) => (
                  <li key={`${backlink.sourceNoteId}-${backlink.targetRaw}`} style={{ display: "block" }}>
                    <button
                      type="button"
                      className="md-list-item"
                      style={{ width: "100%", textAlign: "left", background: "transparent", borderBottom: "1px solid var(--md-sys-color-outline-variant)" }}
                      onClick={() => router.push(`/notes/${backlink.sourceNoteId}`)}
                    >
                      <div className="md-list-item-content">
                        <span className="md-list-item-headline">{backlink.sourceNoteTitle}</span>
                        <span className="md-list-item-supporting-text" style={{ color: "var(--md-sys-color-primary)" }}>-&gt; {backlink.targetRaw}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <div style={{ maxWidth: "800px", margin: "32px auto 64px", padding: "0 32px" }}>
          <Card variant="outlined" style={{ borderColor: "var(--md-sys-color-tertiary)" }}>
            <CardHeader>
              <CardTitle style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--md-sys-color-tertiary)" }}>
                <span>YZ</span>
                Bekleyen öneriler ({proposals.length})
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: 0 }}>
              <ul className="md-list">
                {proposals.map((proposal) => (
                  <li key={proposal.id} style={{ display: "block", borderBottom: "1px solid var(--md-sys-color-outline-variant)", padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: proposal.summary ? "12px" : "0" }}>
                      <div>
                        <div style={{ fontWeight: "bold", fontSize: "var(--md-sys-typescale-title-medium-size)", color: "var(--md-sys-color-on-surface)" }}>{proposal.title}</div>
                        <div style={{ fontSize: "var(--md-sys-typescale-body-small-size)", color: "var(--md-sys-color-on-surface-variant)" }}>
                          <span style={{ textTransform: "uppercase", padding: "2px 6px", background: "var(--md-sys-color-surface-container-high)", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", marginRight: "8px" }}>{proposal.status}</span>
                          {new Date(proposal.createdAt).toLocaleString("tr-TR")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {proposal.status === "pending" ? (
                          <>
                            <Button
                              variant="tonal"
                              onClick={() => void handleApplyProposal(proposal.id)}
                            >
                              Uygula
                            </Button>
                            <Button
                              variant="text"
                              onClick={() => void handleRejectProposal(proposal.id)}
                            >
                              Reddet
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {proposal.summary ? (
                      <div style={{ fontSize: "var(--md-sys-typescale-body-medium-size)", color: "var(--md-sys-color-on-surface-variant)", background: "var(--md-sys-color-surface-container-lowest)", padding: "12px", borderRadius: "8px" }}>{proposal.summary}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ContextMenu
        items={noteContextItems}
        position={contextMenuPosition}
        onClose={closeContextMenu}
      />
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M5.5 2.25c0-.41.34-.75.75-.75h3.5c.41 0 .75.34.75.75v1.08c0 .23.11.45.3.59l1.03.77c.48.35.23 1.11-.36 1.11H9.8v3.61l1.12 1.12a.75.75 0 0 1-.53 1.28H8.75v2.5a.75.75 0 0 1-1.5 0v-2.5H5.61a.75.75 0 0 1-.53-1.28L6.2 9.41V5.8H3.78c-.59 0-.84-.76-.36-1.11l1.03-.77a.74.74 0 0 0 .3-.59V2.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="m4.22 6.47 3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function buildFolderLabel(
  folder: { id: string; name: string; parentId: string | null },
  folders: Array<{ id: string; name: string; parentId: string | null }>
) {
  const foldersById = new Map(
    folders.map((candidate) => [candidate.id, candidate])
  );
  const labels = [folder.name];
  let currentParentId = folder.parentId;

  while (currentParentId) {
    const parentFolder = foldersById.get(currentParentId);

    if (!parentFolder) {
      break;
    }

    labels.unshift(parentFolder.name);
    currentParentId = parentFolder.parentId;
  }

  return labels.join(" / ");
}
