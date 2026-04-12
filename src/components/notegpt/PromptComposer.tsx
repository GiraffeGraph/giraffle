import { Button } from "@/components/ui/Button";
import styles from "./NoteGptWorkspace.module.css";

interface PromptComposerProps {
  draft: string;
  isStreaming: boolean;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

export function PromptComposer({
  draft,
  isStreaming,
  composerRef,
  onDraftChange,
  onSend,
}: PromptComposerProps) {
  return (
    <section className={styles.composerSection} aria-label="Mesaj yaz">
      <div className={styles.composerPanel}>
        <div className={styles.composerBody}>
          <textarea
            ref={composerRef}
            className={styles.composerInput}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="Notların hakkında sor..."
            rows={3}
          />
        </div>

        <div className={styles.composerFooter}>
          <span className={styles.composerHintInline}>Ctrl/Cmd + Enter</span>

          <Button
            variant="filled"
            leadingIcon="arrow_upward"
            className={styles.sendButton}
            onClick={onSend}
            disabled={!draft.trim() || isStreaming}
            aria-label={isStreaming ? "Yanıtlanıyor" : "Mesaj gönder"}
          >
            <span className={styles.sendText}>{isStreaming ? "Yazıyor" : "Gönder"}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}
