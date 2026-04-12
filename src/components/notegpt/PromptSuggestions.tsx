import styles from "./NoteGptWorkspace.module.css";
import type { PromptModeId, PromptSuggestion } from "./notegpt.types";

interface PromptSuggestionsProps {
  items: PromptSuggestion[];
  onSelect: (prompt: string, mode: PromptModeId) => void;
}

export function PromptSuggestions({
  items,
  onSelect,
}: PromptSuggestionsProps) {
  return (
    <section className={styles.suggestionsSection}>
      <div className={styles.suggestionsList} aria-label="Hızlı komutlar">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.suggestionCard}
            onClick={() => onSelect(item.prompt, item.mode)}
          >
            <span className={styles.suggestionIcon}>
              <span className="material-symbols-outlined">{item.icon}</span>
            </span>
            <span className={styles.suggestionTitle}>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
