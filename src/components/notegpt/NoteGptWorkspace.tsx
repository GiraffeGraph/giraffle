"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationThread } from "./ConversationThread";
import { PromptComposer } from "./PromptComposer";
import styles from "./NoteGptWorkspace.module.css";
import {
  type ChatMessage,
  type NoteGptWorkspaceProps,
} from "./notegpt.types";

export function NoteGptWorkspace({
  notes,
  folders,
  embedded = false,
  initialSessionId = null,
  initialMessages = [],
}: NoteGptWorkspaceProps) {
  const router = useRouter();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessionId,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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
      .sort((left, right) => left.localeCompare(right, "tr"))
      .map((folderPath) => `- ${folderPath}`);

    const noteLines = notes
      .map((note) => {
        const folderPath = note.folderId
          ? folderMeta.get(note.folderId)?.path ?? "Klasörsüz"
          : "Klasörsüz";

        return `- ${note.title} [${folderPath}]`;
      })
      .sort((left, right) => left.localeCompare(right, "tr"));

    return [
      "Klasörler:",
      ...(folderLines.length > 0 ? folderLines : ["- Klasör yok"]),
      "",
      "Notlar:",
      ...(noteLines.length > 0 ? noteLines : ["- Not yok"]),
    ].join("\n");
  }, [folderMeta, folders, notes]);

  const handleSend = async () => {
    const trimmed = draft.trim();

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
      const response = await fetch("/api/notegpt/chat", {
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
        throw new Error("NoteGPT request failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamed = "";
      const responseSessionId = response.headers.get("X-NoteGPT-Session-Id");

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
                : message
            )
          );
        }
      }

      if (nextSessionId && !embedded) {
        router.replace(`/notegpt?session=${nextSessionId}`, { scroll: false });
        router.refresh();
      }
    } catch (error) {
      console.error("NoteGPT error", error);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  "Yanıtta bir hata oluştu. İsteği tekrar dene ya da bağlamı biraz daha daralt.",
              }
            : message
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className={`${styles.page} ${embedded ? styles.pageEmbedded : ""}`}>
      <div className={styles.pageInner}>
        <main
          className={`${styles.chatShell} ${isEmpty ? styles.chatShellEmpty : ""}`}
          aria-label="NoteGPT sohbet"
        >
          <div className={styles.threadViewport}>
            {isEmpty ? (
              <section className={styles.emptyState}>
                <p className={styles.emptyEyebrow}>
                  {notes.length} not ve {folders.length} klasör hazır
                </p>
                <h1 className={styles.emptyTitle}>
                  Bugün notlarınla neyi netleştirelim?
                </h1>
                <p className={styles.emptyBody}>
                  Sorunu yaz; kütüphanendeki başlıkları ve klasörleri bağlam olarak kullanayım.
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
              onSend={() => void handleSend()}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
