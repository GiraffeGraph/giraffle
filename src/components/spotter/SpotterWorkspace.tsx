"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationThread } from "./ConversationThread";
import { PromptComposer } from "./PromptComposer";
import styles from "./SpotterWorkspace.module.css";
import {
  type ChatMessage,
  type SpotterWorkspaceProps,
} from "./spotter.types";

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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessionId,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const initialPromptRef = useRef<string | null>(null);
  const isEmpty = messages.length === 0 && !isStreaming;

  const folderMeta = useMemo(() => {
    const byId = new Map(
      folders.map((folder) => [
        folder.id,
        {
          ...folder,
          path: "",
        },
      ])
    );

    const resolvePath = (folderId: string): string => {
      const current = byId.get(folderId);

      if (!current) {
        return "";
      }

      if (current.path) {
        return current.path;
      }

      const parentPath = current.parentId ? resolvePath(current.parentId) : "";
      current.path = parentPath ? `${parentPath} / ${current.name}` : current.name;
      return current.path;
    };

    for (const folder of folders) {
      resolvePath(folder.id);
    }

    return byId;
  }, [folders]);

  const workspaceContext = useMemo(() => {
    const folderLines = folders
      .map((folder) => folderMeta.get(folder.id)?.path ?? folder.name)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((folderPath) => `- ${folderPath}`);

    const noteLines = notes
      .map((note) => {
        const folderPath = note.folderId
          ? folderMeta.get(note.folderId)?.path ?? "Unfiled"
          : "Unfiled";

        return `- ${note.title} [${folderPath}]`;
      })
      .sort((left, right) => left.localeCompare(right, "en"));

    return [
      "Folders:",
      ...(folderLines.length > 0 ? folderLines : ["- No folders"]),
      "",
      "Notes:",
      ...(noteLines.length > 0 ? noteLines : ["- No notes"]),
    ].join("\n");
  }, [folderMeta, folders, notes]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();

      if (!trimmed || isStreaming) {
        return;
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantMessageId = `assistant-${Date.now()}`;
      let nextSessionId = activeSessionId;

      setLastError(null);
      setLastSubmittedPrompt(trimmed);
      setDraft("");
      setIsStreaming(true);
      setMessages((current) => [
        ...current,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
        },
      ]);

      try {
        const response = await fetch("/api/spotter/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId,
            prompt: trimmed,
            context: workspaceContext,
          }),
        });

        if (!response.ok) {
          const errorText = (await response.text().catch(() => "")).trim();
          throw new Error(errorText || "Spotter request failed");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let streamed = "";
        const responseSessionId = response.headers.get("X-Spotter-Session-Id");

        if (responseSessionId) {
          nextSessionId = responseSessionId;
          setActiveSessionId(responseSessionId);
        }

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            streamed += decoder.decode(value, { stream: true });
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: streamed,
                    }
                  : message,
              ),
            );
          }
        }

        if (nextSessionId && !embedded) {
          router.replace(`/spotter?session=${nextSessionId}`, { scroll: false });
          router.refresh();
        }
      } catch (error) {
        console.error("Spotter error", error);
        const fallbackMessage =
          error instanceof Error && error.message === "AI service is not configured"
            ? "Spotter is not configured right now. Add an OpenAI API key from Settings → Self-host & Integrations, or ask the administrator to set OPENAI_API_KEY."
            : "There was an error generating the response. Try again or narrow the context a bit more.";

        setLastError(fallbackMessage);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: fallbackMessage,
                }
              : message,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeSessionId, embedded, isStreaming, router, workspaceContext],
  );

  const handleSend = useCallback(() => {
    void sendPrompt(draft);
  }, [draft, sendPrompt]);

  const handleRetry = useCallback(() => {
    if (!lastSubmittedPrompt || isStreaming) {
      return;
    }

    void sendPrompt(lastSubmittedPrompt);
  }, [isStreaming, lastSubmittedPrompt, sendPrompt]);

  useEffect(() => {
    const trimmedPrompt = initialPrompt?.trim();

    if (!trimmedPrompt) {
      return;
    }

    if (initialPromptRef.current === trimmedPrompt) {
      return;
    }

    initialPromptRef.current = trimmedPrompt;
    void sendPrompt(trimmedPrompt);
  }, [initialPrompt, sendPrompt]);

  return (
    <div className={`${styles.page} ${embedded ? styles.pageEmbedded : ""}`}>
      <div className={styles.spotsBg} aria-hidden="true" />
      <div className={styles.pageInner}>
        <main
          className={`${styles.chatShell} ${isEmpty ? styles.chatShellEmpty : ""}`}
          aria-label="Spotter chat"
        >
          {lastError ? (
            <section className={styles.errorBanner} role="status" aria-live="polite">
              <div className={styles.errorBannerMain}>
                <span className="material-symbols-outlined" aria-hidden="true">error</span>
                <p>{lastError}</p>
              </div>
              <div className={styles.errorBannerActions}>
                <button
                  type="button"
                  className={styles.errorBannerButton}
                  onClick={handleRetry}
                  disabled={!lastSubmittedPrompt || isStreaming}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className={`${styles.errorBannerButton} ${styles.errorBannerButtonGhost}`}
                  onClick={() => setLastError(null)}
                >
                  Dismiss
                </button>
              </div>
            </section>
          ) : null}

          <div className={styles.threadViewport}>
            {isEmpty ? (
              <section className={styles.emptyState}>
                <p className={styles.emptyEyebrow}>
                  {notes.length} notes and {folders.length} folders ready
                </p>
                <h1 className={styles.emptyTitle}>
                  What should we spot today?
                </h1>
                <p className={styles.emptyBody}>
                  Write your question and I’ll spot connections across the titles and folders in your library.
                </p>
              </section>
            ) : (
              <ConversationThread messages={messages} isStreaming={isStreaming} />
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
