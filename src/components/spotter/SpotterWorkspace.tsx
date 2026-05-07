"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { ConversationThread } from "./ConversationThread";
import { PromptComposer, type ComposerToolIntent } from "./PromptComposer";
import {
  findSpotterCommand,
  renderSpotterCommandHelp,
} from "@/domain/spotter-commands/catalog";
import styles from "./SpotterWorkspace.module.css";
import type { SpotterWorkspaceProps } from "./spotter.types";

interface SlashCommandResponse {
  title: string;
  content: string;
  assistantText: string;
  sessionId: string;
  error?: never;
}

interface SlashCommandErrorResponse {
  error: string;
}

function makeTextMessage(
  role: "user" | "assistant",
  text: string,
  id = crypto.randomUUID(),
): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  } as UIMessage;
}

function parseSlashCommand(input: string): { name: string; args: string } | null {
  if (!input.startsWith("/") || input.startsWith("//")) return null;
  const match = input.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: match[1]?.toLowerCase() ?? "", args: match[2]?.trim() ?? "" };
}

export function SpotterWorkspace({
  notes,
  folders,
  embedded = false,
  initialSessionId = null,
  initialMessages = [],
  initialPrompt = null,
}: SpotterWorkspaceProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const initialPromptRef = useRef<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessionId,
  );
  const [draft, setDraft] = useState("");
  const [selectedToolIntent, setSelectedToolIntent] = useState<ComposerToolIntent | null>(null);
  const [commandPending, setCommandPending] = useState(false);

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

  const adoptSessionId = useCallback(
    (serverSessionId: string) => {
      if (serverSessionId === activeSessionId) return;
      setActiveSessionId(serverSessionId);
      if (!embedded) {
        window.history.replaceState(
          null,
          "",
          `/spotter?session=${encodeURIComponent(serverSessionId)}`,
        );
      }
    },
    [activeSessionId, embedded],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolApprovalResponse,
    setMessages,
  } = useChat({
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport: new DefaultChatTransport({
      api: "/api/spotter/chat",
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: {
          ...(body ?? {}),
          // Only send our real session id when we have one. useChat's internal
          // chat id is a UUID it generates locally; sending that to the server
          // would trigger a "session not found" 404.
          ...(activeSessionId ? { id: activeSessionId } : {}),
          messages,
          mode: "workspace",
          workspaceContext,
        },
      }),
    }),
    onFinish: ({ message }) => {
      const meta = (message as { metadata?: { sessionId?: string } }).metadata;
      const serverSessionId = meta?.sessionId;
      if (serverSessionId) adoptSessionId(serverSessionId);
    },
  });

  const isStreaming = status === "submitted" || status === "streaming" || commandPending;
  const errorMessage =
    error instanceof Error
      ? error.message === "AI service is not configured"
        ? "Spotter is not configured. Add an OpenAI API key from Settings → Self-host & Integrations."
        : "There was an error generating the response. Try again."
      : null;
  const isEmpty = messages.length === 0 && !isStreaming;

  const appendLocalExchange = useCallback(
    (userText: string, assistantText: string) => {
      setMessages((current) => [
        ...current,
        makeTextMessage("user", userText),
        makeTextMessage("assistant", assistantText),
      ]);
    },
    [setMessages],
  );

  const runDirectCommand = useCallback(
    async (name: string, args: string, originalText: string) => {
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      setMessages((current) => [
        ...current,
        makeTextMessage("user", originalText, userMessageId),
      ]);
      setCommandPending(true);
      try {
        const res = await fetch("/api/spotter/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(activeSessionId ? { id: activeSessionId } : {}),
            command: name,
            args,
            userText: originalText,
            userMessageId,
            assistantMessageId,
          }),
        });
        const payload = await res.json().catch(() => null) as
          | SlashCommandResponse
          | SlashCommandErrorResponse
          | null;
        if (!res.ok || !payload) {
          const message = payload && "error" in payload
            ? payload.error
            : "Slash command failed.";
          throw new Error(message);
        }
        if ("error" in payload) throw new Error(payload.error);
        adoptSessionId(payload.sessionId);
        setMessages((current) => [
          ...current,
          makeTextMessage("assistant", payload.assistantText, assistantMessageId),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Slash command failed.";
        setMessages((current) => [
          ...current,
          makeTextMessage("assistant", `Command failed: ${message}`),
        ]);
      } finally {
        setCommandPending(false);
      }
    },
    [activeSessionId, adoptSessionId, setMessages],
  );

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    setDraft("");

    const slash = parseSlashCommand(trimmed);
    if (slash) {
      const command = findSpotterCommand(slash.name);
      if (!command) {
        appendLocalExchange(trimmed, `Unknown command: /${slash.name}\n\nType /help for available commands.`);
        return;
      }
      if (command.type === "local") {
        appendLocalExchange(trimmed, renderSpotterCommandHelp());
        return;
      }
      if (command.type === "macro") {
        if (command.argumentHint && !slash.args.trim()) {
          appendLocalExchange(trimmed, `Usage: /${command.name} ${command.argumentHint}`);
          return;
        }
        const prompt = command.transformPrompt?.(slash.args) ?? slash.args;
        if (!prompt.trim()) {
          appendLocalExchange(trimmed, `Usage: /${command.name} ${command.argumentHint ?? "<text>"}`);
          return;
        }
        void sendMessage({ text: prompt }, { body: { toolIntent: "web_search" } });
        return;
      }
      void runDirectCommand(command.name, slash.args, trimmed);
      return;
    }

    const toolIntent = selectedToolIntent;
    setSelectedToolIntent(null);
    void sendMessage(
      { text: trimmed },
      toolIntent ? { body: { toolIntent } } : undefined,
    );
  }, [appendLocalExchange, draft, isStreaming, runDirectCommand, selectedToolIntent, sendMessage]);

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
              selectedToolIntent={selectedToolIntent}
              onDraftChange={setDraft}
              onToolIntentChange={setSelectedToolIntent}
              onSend={handleSend}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
