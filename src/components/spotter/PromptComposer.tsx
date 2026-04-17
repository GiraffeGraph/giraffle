import { Button } from "@/components/ui/Button";
import styles from "./SpotterWorkspace.module.css";

interface PromptComposerProps {
  draft: string;
  isStreaming: boolean;
  notesCount: number;
  foldersCount: number;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

export function PromptComposer({
  draft,
  isStreaming,
  notesCount,
  foldersCount,
  composerRef,
  onDraftChange,
  onSend,
}: PromptComposerProps) {
  return (
    <section className={styles.composerSection} aria-label="Write message">
      <div className={styles.composerPanel}>
        <div className={styles.composerBody}>
          <textarea
            ref={composerRef}
            className={styles.composerInput}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask Spotter..."
            rows={3}
          />
        </div>

        <div className={styles.composerFooter}>
          <div className={styles.composerContext}>
            <span className={styles.contextPill}>
              <span className="material-symbols-outlined sm" aria-hidden="true">
                account_tree
              </span>
              {notesCount} notes
            </span>
            <span className={styles.contextPill}>
              <span className="material-symbols-outlined sm" aria-hidden="true">
                folder
              </span>
              {foldersCount} folders
            </span>
            <span className={styles.composerHintInline}>Enter to send · Shift+Enter newline</span>
          </div>

          <Button
            variant="filled"
            leadingIcon="arrow_upward"
            className={styles.sendButton}
            onClick={onSend}
            disabled={!draft.trim() || isStreaming}
            aria-label={isStreaming ? "Responding" : "Send message"}
          >
            <span className={styles.sendText}>{isStreaming ? "Thinking…" : "Send"}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}
