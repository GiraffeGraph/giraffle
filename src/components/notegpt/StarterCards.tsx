import styles from "./NoteGptWorkspace.module.css";
import type { PromptModeId, StarterCard } from "./notegpt.types";

interface StarterCardsProps {
  items: StarterCard[];
  onSelect: (prompt: string, mode: PromptModeId) => void;
}

export function StarterCards({ items, onSelect }: StarterCardsProps) {
  return (
    <section className={styles.starterSection}>
      <div className={styles.starterGrid}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.starterCard}
            onClick={() => onSelect(item.prompt, item.mode)}
          >
            <span className={styles.starterIcon}>
              <span className="material-symbols-outlined">{item.icon}</span>
            </span>
            <span className={styles.starterTitle}>{item.title}</span>
            <span className={styles.starterBody}>{item.body}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
