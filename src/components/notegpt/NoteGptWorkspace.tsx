"use client";

import { useMemo, useRef, useState } from "react";
import { ConversationThread } from "./ConversationThread";
import { NoteGptHero } from "./NoteGptHero";
import { PromptComposer } from "./PromptComposer";
import { PromptSuggestions } from "./PromptSuggestions";
import { StarterCards } from "./StarterCards";
import styles from "./NoteGptWorkspace.module.css";
import {
  PROMPT_MODES,
  PROMPT_SUGGESTIONS,
  STARTER_CARDS,
  type ChatMessage,
  type NoteGptWorkspaceProps,
  type PromptModeId,
} from "./notegpt.types";

export function NoteGptWorkspace({
  notes,
  folders,
  embedded = false,
}: NoteGptWorkspaceProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [activeMode, setActiveMode] = useState<PromptModeId>("general");
  const [isStreaming, setIsStreaming] = useState(false);

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

  const latestActivityLabel = useMemo(() => {
    if (notes.length === 0) {
      return "Boş";
    }

    const latest = [...notes].sort((left, right) =>
      right.updatedAtLabel.localeCompare(left.updatedAtLabel)
    )[0];

    return latest ? formatRelativeTime(latest.updatedAtLabel) : "Boş";
  }, [notes]);

  const handlePromptSelect = (prompt: string, mode: PromptModeId) => {
    setActiveMode(mode);
    setDraft(prompt);
    composerRef.current?.focus();
  };

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
    const mode = PROMPT_MODES.find((item) => item.id === activeMode) ?? PROMPT_MODES[0];
    const recentTranscript = [...messages, userMessage]
      .slice(-8)
      .map((message) => `${message.role === "user" ? "Kullanıcı" : "NoteGPT"}: ${message.content}`)
      .join("\n\n");

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
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "workspace",
          prompt: `[${mode.promptPrefix}]\n${recentTranscript}`,
          context: workspaceContext,
        }),
      });

      if (!response.ok) {
        throw new Error("NoteGPT request failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamed = "";

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
        <NoteGptHero
          notesCount={notes.length}
          foldersCount={folders.length}
          latestActivityLabel={latestActivityLabel}
        />

        <PromptComposer
          composerRef={composerRef}
          draft={draft}
          isStreaming={isStreaming}
          notesCount={notes.length}
          foldersCount={folders.length}
          activeMode={activeMode}
          onDraftChange={setDraft}
          onModeChange={setActiveMode}
          onSend={() => void handleSend()}
        />

        <PromptSuggestions
          items={PROMPT_SUGGESTIONS}
          onSelect={handlePromptSelect}
        />

        {messages.length > 0 || isStreaming ? (
          <ConversationThread messages={messages} isStreaming={isStreaming} />
        ) : (
          <StarterCards items={STARTER_CARDS} onSelect={handlePromptSelect} />
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(input: string) {
  const now = Date.now();
  const target = new Date(input).getTime();
  const diff = target - now;
  const absSeconds = Math.round(Math.abs(diff) / 1000);
  const rtf = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });

  if (absSeconds < 3600) {
    return rtf.format(Math.round(diff / (1000 * 60)), "minute");
  }

  if (absSeconds < 86400) {
    return rtf.format(Math.round(diff / (1000 * 60 * 60)), "hour");
  }

  if (absSeconds < 86400 * 7) {
    return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24)), "day");
  }

  return new Intl.DateTimeFormat("tr", {
    month: "short",
    day: "numeric",
  }).format(new Date(input));
}
