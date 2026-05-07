"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useRouter } from "next/navigation";
import { ConversationThread } from "./ConversationThread";
import { PromptComposer } from "./PromptComposer";
import styles from "./SpotterWorkspace.module.css";
import type { SpotterWorkspaceProps } from "./spotter.types";

export function SpotterWorkspace({
  notes,
  folders,
  embedded = false,
  initialSessionId = null,
  initialMessages = [],
  initialPrompt = null,
}: SpotterWorkspaceProps) {
  const router = useRouter();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const initialPromptRef = useRef<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessionId,
  );
  const [draft, setDraft] = useState("");

  const folderMeta = useMemo(() => {
    const byId = new Map(
      folders.map((folder) => [
        folder.id,
        { ...folder, path: "" },
      ]),
    );
    const resolvePath = (folderId: string): string => {
      const current = byId.get(folderId);
      if (!current) return "";
      if (current.path) return current.path;
      const parentPath = current.parentId ? resolvePath(current.parentId) : "";
      current.path = parentPath ? `${parentPath} / ${current.name}` : current.name;
      return current.path;
    };
    for (const folder of folders) resolvePath(folder.id);
    return byId;
  }, [folders]);

  const workspaceContext = useMemo(() => {
    const folderLines = folders
      .map((folder) => folderMeta.get(folder.id)?.path ?? folder.name)
      .sort((l, r) => l.localeCompare(r, "en"))
      .map((p) => `- ${p}`);
    const noteLines = notes
      .map((note) => {
        const path = note.folderId ? folderMeta.get(note.folderId)?.path ?? "Unfiled" : "Unfiled";
        return `- ${note.title} [${path}]`;
      })
      .sort((l, r) => l.localeCompare(r, "en"));
    return [
      "Folders:",
      ...(folderLines.length > 0 ? folderLines : ["- No folders"]),
      "",
      "Notes:",
      ...(noteLines.length > 0 ? noteLines : ["- No notes"]),
    ].join("\n");
  }, [folderMeta, folders, notes]);

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolApprovalResponse,
    setMessages,
  } = useChat({
    id: activeSessionId ?? undefined,
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport: new DefaultChatTransport({
      api: "/api/spotter/chat",
      prepareSendMessagesRequest: ({ messages, id, body }) => ({
        body: {
          ...(body ?? {}),
          id,
          messages,
          mode: "workspace",
          workspaceContext,
        },
      }),
    }),
    onFinish: ({ message }) => {
      // Keep the URL synced with the session id when the server creates one.
      if (!activeSessionId && message.id && !embedded) {
        // session id comes via response header, but useChat doesn't forward it;
        // fall back to refreshing the route to let server reload session id from
        // the persisted message.
        router.refresh();
      }
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";
  const errorMessage =
    error instanceof Error
      ? error.message === "AI service is not configured"
        ? "Spotter is not configured. Add an OpenAI API key from Settings → Self-host & Integrations."
        : "There was an error generating the response. Try again."
      : null;
  const isEmpty = messages.length === 0 && !isStreaming;

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    setDraft("");
    void sendMessage({ text: trimmed });
  }, [draft, isStreaming, sendMessage]);

  const handleApproval = useCallback(
    (id: string, approved: boolean) => {
      addToolApprovalResponse({ id, approved });
    },
    [addToolApprovalResponse],
  );

  const handleRetry = useCallback(() => {
    if (messages.length === 0) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const text = (lastUser.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("");
    if (text) void sendMessage({ text });
  }, [messages, sendMessage]);

  useEffect(() => {
    const trimmed = initialPrompt?.trim();
    if (!trimmed) return;
    if (initialPromptRef.current === trimmed) return;
    initialPromptRef.current = trimmed;
    void sendMessage({ text: trimmed });
  }, [initialPrompt, sendMessage]);

  useEffect(() => {
    if (initialSessionId && !activeSessionId) {
      setActiveSessionId(initialSessionId);
    }
  }, [initialSessionId, activeSessionId]);

  // Keep setMessages reference to avoid lint warning when initialMessages changes.
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${styles.page} ${embedded ? styles.pageEmbedded : ""}`}>
      <div className={styles.spotsBg} aria-hidden="true" />
      <div className={styles.pageInner}>
        <main
          className={`${styles.chatShell} ${isEmpty ? styles.chatShellEmpty : ""}`}
          aria-label="Spotter chat"
        >
          {errorMessage && (
            <section className={styles.errorBanner} role="status" aria-live="polite">
              <div className={styles.errorBannerMain}>
                <span className="material-symbols-outlined" aria-hidden="true">error</span>
                <p>{errorMessage}</p>
              </div>
              <div className={styles.errorBannerActions}>
                <button
                  type="button"
                  className={styles.errorBannerButton}
                  onClick={handleRetry}
                  disabled={isStreaming}
                >
                  Retry
                </button>
              </div>
            </section>
          )}

          <div className={styles.threadViewport}>
            {isEmpty ? (
              <section className={styles.emptyState}>
                <p className={styles.emptyEyebrow}>
                  {notes.length} notes and {folders.length} folders ready
                </p>
                <h1 className={styles.emptyTitle}>What should we spot today?</h1>
                <p className={styles.emptyBody}>
                  Spotter can search and edit your notes, browse folders, and call your connected
                  Trails. Destructive actions ask for approval before running.
                </p>
              </section>
            ) : (
              <ConversationThread
                messages={messages}
                isStreaming={isStreaming}
                onApproval={handleApproval}
              />
            )}
          </div>

          <div className={styles.composerDock}>
            <PromptComposer
              composerRef={composerRef}
              draft={draft}
              isStreaming={isStreaming}
              notesCount={notes.length}
              foldersCount={folders.length}
              onDraftChange={setDraft}
              onSend={handleSend}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
