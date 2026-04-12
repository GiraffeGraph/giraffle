import styles from "./NoteGptWorkspace.module.css";
import type { ChatMessage } from "./notegpt.types";

interface ConversationThreadProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function ConversationThread({
  messages,
  isStreaming,
}: ConversationThreadProps) {
  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <section className={styles.threadSection}>
      <div className={styles.threadList}>
        {messages.map((message) => (
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
                {message.role === "assistant" ? "NoteGPT" : "Sen"}
              </div>
              <div className={styles.messageBody}>
                {message.content ? (
                  message.content
                ) : isStreaming && message.role === "assistant" ? (
                  <span className={styles.typingIndicator} aria-label="Düşünüyor">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  ""
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
