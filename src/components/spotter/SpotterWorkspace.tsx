"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
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
}: SpotterWorkspaceProps) {
  const uid = useId().replace(/:/g, "");
  const filterId = `spotter-organic-${uid}`;
  const patternId = `spotter-giraffe-${uid}`;
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
            ? "Spotter is not configured right now. Try again after an administrator sets OPENAI_API_KEY."
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

  return (
    <div className={`${styles.page} ${embedded ? styles.pageEmbedded : ""}`}>
      <svg
        className={styles.spotsBg}
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={filterId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.032"
              numOctaves="3"
              seed="14"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="11"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <pattern
            id={patternId}
            x="0"
            y="0"
            width="150"
            height="150"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(12)"
          >
            {/* blob 1 — large, top left */}
            <path
              d="M14,16 C28,8 50,13 54,28 C58,43 46,58 30,60 C14,62 5,50 6,35 C7,20 0,24 14,16 Z"
              fill="#C47A2B"
            />
            {/* blob 2 — top right */}
            <path
              d="M88,20 C102,12 122,18 124,34 C126,50 113,63 98,62 C83,61 76,50 78,36 C80,22 74,28 88,20 Z"
              fill="#B8681E"
            />
            {/* blob 3 — alt orta */}
            <path
              d="M42,95 C57,86 76,91 77,105 C78,119 65,130 50,128 C35,126 27,115 30,102 C33,89 27,104 42,95 Z"
              fill="#C47A2B"
            />
            {/* blob 4 — bottom right, small */}
            <path
              d="M104,98 C113,92 124,96 124,106 C124,116 115,123 106,121 C97,119 94,112 97,104 C100,96 95,104 104,98 Z"
              fill="#A85D15"
            />
            {/* blob 5 — sol alt, mini */}
            <path
              d="M4,76 C10,69 20,73 20,82 C20,91 13,97 6,94 C-1,91 0,86 2,79 C4,72 -2,83 4,76 Z"
              fill="#B8681E"
            />
          </pattern>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#${patternId})`}
          filter={`url(#${filterId})`}
        />
      </svg>
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
