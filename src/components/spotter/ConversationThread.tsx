import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
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

  return (
    <div
      style={{
        border: "1px solid var(--md-sys-color-outline-variant)",
        borderRadius: 12,
        padding: 10,
        margin: "6px 0",
        fontSize: 12,
        background: "var(--md-sys-color-surface-container-low)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          build
        </span>
        <strong>{name}</strong>
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>{state}</span>
      </div>
      {part.input !== undefined && (
        <pre
          style={{
            fontSize: 11,
            background: "var(--md-sys-color-surface)",
            padding: 6,
            borderRadius: 6,
            margin: "6px 0 0",
            overflow: "auto",
            maxHeight: 160,
          }}
        >
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
      {state === "output-available" && part.output !== undefined && (
        <pre
          style={{
            fontSize: 11,
            opacity: 0.85,
            background: "var(--md-sys-color-surface)",
            padding: 6,
            borderRadius: 6,
            margin: "6px 0 0",
            overflow: "auto",
            maxHeight: 200,
          }}
        >
          {typeof part.output === "string"
            ? part.output
            : JSON.stringify(part.output, null, 2)}
        </pre>
      )}
      {state === "output-error" && (
        <div style={{ color: "var(--md-sys-color-error)", marginTop: 6 }}>
          {part.errorText ?? "Tool error"}
        </div>
      )}
      {isApproval && part.approval?.id && onApproval && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => onApproval(part.approval!.id, true)}
            style={btnPrimary}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onApproval(part.approval!.id, false)}
            style={btnSecondary}
          >
            Deny
          </button>
        </div>
      )}
    </div>
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
                      return <span key={idx}>{part.text}</span>;
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

const btnPrimary: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  background: "var(--md-sys-color-primary)",
  color: "var(--md-sys-color-on-primary)",
  fontSize: 12,
};

const btnSecondary: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
  background: "transparent",
  color: "var(--md-sys-color-on-surface)",
  border: "1px solid var(--md-sys-color-outline-variant)",
  fontSize: 12,
};
