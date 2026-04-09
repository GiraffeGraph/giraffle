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
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Konuşma</span>
      </div>

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
            <div className={styles.messageRole}>
              {message.role === "assistant" ? "NoteGPT" : "Sen"}
            </div>
            <div className={styles.messageBody}>
              {message.content ||
                (isStreaming && message.role === "assistant"
                  ? "Düşünüyor..."
                  : "")}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
