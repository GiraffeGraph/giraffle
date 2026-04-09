"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface NoteGptWorkspaceProps {
  notes: Array<{
    id: string;
    title: string;
    icon: string | null;
    folderId: string | null;
    updatedAtLabel: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    icon: string | null;
    parentId: string | null;
  }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  "Bu kutuphaneyi ozetle",
  "Tum notlar icin odak alanlarini cikar",
  "Klasor yapisini daha iyi nasil duzenlerim",
];

export function NoteGptWorkspace({
  notes,
  folders,
}: NoteGptWorkspaceProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "NoteGPT hazir. Calisma alanindaki notlar ve klasorler uzerinden ozet, plan, siniflandirma ve yeni fikirler isteyebilirsin.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const folderMeta = useMemo(() => {
    const byId = new Map(
      folders.map((folder) => [
        folder.id,
        {
          ...folder,
          path: "",
          depth: 0,
        },
      ])
    );

    const resolveFolder = (folderId: string): { path: string; depth: number } => {
      const current = byId.get(folderId);

      if (!current) {
        return { path: "", depth: 0 };
      }

      if (current.path) {
        return { path: current.path, depth: current.depth };
      }

      const parent = current.parentId ? resolveFolder(current.parentId) : null;
      current.depth = parent ? parent.depth + 1 : 0;
      current.path = parent?.path
        ? `${parent.path} / ${current.name}`
        : current.name;
      return { path: current.path, depth: current.depth };
    };

    for (const folder of folders) {
      resolveFolder(folder.id);
    }

    return byId;
  }, [folders]);

  const workspaceContext = useMemo(() => {
    const folderLines = folders
      .map((folder) => ({
        name: folderMeta.get(folder.id)?.path ?? folder.name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "tr"))
      .map((folder) => `- ${folder.name}`);
    const noteLines = notes.map((note) => {
      const folderPath = note.folderId
        ? folderMeta.get(note.folderId)?.path ?? "Klasorsuz"
        : "Klasorsuz";
      return `- ${note.title} [${folderPath}]`;
    });

    return [
      "Klasorler:",
      ...(folderLines.length > 0 ? folderLines : ["- Klasor yok"]),
      "",
      "Notlar:",
      ...(noteLines.length > 0 ? noteLines : ["- Not yok"]),
    ].join("\n");
  }, [folderMeta, folders, notes]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handlePromptSelect = (prompt: string) => {
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
    const recentTranscript = [...messages, userMessage]
      .slice(-8)
      .map((message) => `${message.role === "user" ? "Kullanici" : "NoteGPT"}: ${message.content}`)
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
          prompt: recentTranscript,
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
                  "Yanitta bir hata olustu. Istegi tekrar dene ya da baglamini daha kisa yaz.",
              }
            : message
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="notegpt-page">
      <div className="notegpt-shell">
        <section className="notegpt-chat-panel">
          <div className="notegpt-chat-header">
            <div>
              <div className="notegpt-kicker">Workspace Copilot</div>
              <h1 className="notegpt-title">NoteGPT</h1>
              <p className="notegpt-subtitle">
                Calisma alanin uzerinden sor, plan cikart ve duzen onerileri al.
              </p>
            </div>
            <div className="notegpt-stat-row">
              <div className="notegpt-stat-card">
                <span className="notegpt-stat-number">{notes.length}</span>
                <span className="notegpt-stat-label">Not</span>
              </div>
              <div className="notegpt-stat-card">
                <span className="notegpt-stat-number">{folders.length}</span>
                <span className="notegpt-stat-label">Klasor</span>
              </div>
            </div>
          </div>

          <div className="notegpt-prompt-row">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="notegpt-prompt-chip"
                onClick={() => handlePromptSelect(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="notegpt-message-stream">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`notegpt-message ${message.role === "assistant" ? "assistant" : "user"}`}
              >
                <div className="notegpt-message-role">
                  {message.role === "assistant" ? "NoteGPT" : "Sen"}
                </div>
                <div className="notegpt-message-body">
                  {message.content || (isStreaming && message.role === "assistant"
                    ? "Dusunuyor..."
                    : "")}
                </div>
              </div>
            ))}
          </div>

          <div className="notegpt-composer">
            <textarea
              ref={composerRef}
              className="notegpt-composer-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="NoteGPT'ye bir soru sor ya da bir gorev ver..."
              rows={4}
            />
            <div className="notegpt-composer-actions">
              <span className="notegpt-composer-hint">Ctrl/Cmd + Enter</span>
              <Button
                variant="filled"
                onClick={() => void handleSend()}
                disabled={!draft.trim() || isStreaming}
              >
                {isStreaming ? "Yanitlaniyor..." : "Gonder"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
