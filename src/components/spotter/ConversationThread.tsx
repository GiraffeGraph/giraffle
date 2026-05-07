import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { MarkdownText } from "./MarkdownText";
import styles from "./SpotterWorkspace.module.css";

interface ConversationThreadProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onApproval?: (id: string, approved: boolean) => void;
}

interface UIPart {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
}

function isToolPart(part: UIPart): boolean {
  return (
    part.type.startsWith("tool-") ||
    part.type === "dynamic-tool"
  );
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStateLabel(state: string): string {
  switch (state) {
    case "input-streaming":
      return "running";
    case "input-available":
      return "called";
    case "output-available":
      return "done";
    case "output-error":
      return "error";
    case "approval-requested":
      return "approval";
    default:
      return state;
  }
}

function ToolInvocation({
  part,
  onApproval,
}: {
  part: UIPart;
  onApproval?: (id: string, approved: boolean) => void;
}) {
  const name =
    part.toolName ??
    (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "tool");
  const state = part.state ?? "input-available";
  const isApproval = state === "approval-requested";
  const isError = state === "output-error";

  return (
    <details
      className={`${styles.toolInvocation} ${isError ? styles.toolInvocationError : ""}`}
      open={isApproval || isError || undefined}
    >
      <summary className={styles.toolSummary}>
        <span className="material-symbols-outlined" aria-hidden="true">
          {isError ? "error" : isApproval ? "approval" : "build"}
        </span>
        <span className={styles.toolName}>{name}</span>
        <span className={styles.toolState}>{getStateLabel(state)}</span>
      </summary>

      <div className={styles.toolDetails}>
        {part.input !== undefined && (
          <div className={styles.toolBlock}>
            <div className={styles.toolBlockLabel}>Input</div>
            <pre>{stringifyValue(part.input)}</pre>
          </div>
        )}
        {state === "output-available" && part.output !== undefined && (
          <div className={styles.toolBlock}>
            <div className={styles.toolBlockLabel}>Output</div>
            <pre>{stringifyValue(part.output)}</pre>
          </div>
        )}
        {isError && (
          <div className={styles.toolErrorText}>{part.errorText ?? "Tool error"}</div>
        )}
        {isApproval && part.approval?.id && onApproval && (
          <div className={styles.toolApprovalActions}>
            <button type="button" onClick={() => onApproval(part.approval!.id, true)}>
              Approve
            </button>
            <button type="button" onClick={() => onApproval(part.approval!.id, false)}>
              Deny
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

export function ConversationThread({
  messages,
  isStreaming,
  onApproval,
}: ConversationThreadProps) {
  const threadTailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadTailRef.current?.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [isStreaming, messages]);

  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <section className={styles.threadSection}>
      <div className={styles.threadList}>
        {messages.map((message) => {
          const parts = (message as { parts?: UIPart[] }).parts ?? [];
          const hasContent = parts.some(
            (p) => (p.type === "text" && (p.text ?? "").length > 0) || isToolPart(p),
          );
          return (
            <article
              key={message.id}
              className={`${styles.messageCard} ${
                message.role === "assistant"
                  ? styles.messageAssistant
                  : styles.messageUser
              }`}
            >
              <div className={styles.messageAvatar} aria-hidden="true">
                {message.role === "assistant" ? (
                  <span className="material-symbols-outlined">auto_awesome</span>
                ) : (
                  "S"
                )}
              </div>
              <div className={styles.messageContent}>
                <div className={styles.messageRole}>
                  {message.role === "assistant" ? "Spotter" : "You"}
                </div>
                <div className={styles.messageBody}>
                  {!hasContent && isStreaming && message.role === "assistant" && (
                    <span className={styles.typingIndicator} aria-label="Thinking">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                  {parts.map((part, idx) => {
                    if (part.type === "text") {
                      return message.role === "assistant" ? (
                        <MarkdownText key={idx} text={part.text ?? ""} />
                      ) : (
                        <span key={idx}>{part.text}</span>
                      );
                    }
                    if (isToolPart(part)) {
                      return (
                        <ToolInvocation
                          key={`${part.toolCallId ?? idx}`}
                          part={part}
                          onApproval={onApproval}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </article>
          );
        })}
        <div ref={threadTailRef} aria-hidden="true" />
      </div>
    </section>
  );
}

