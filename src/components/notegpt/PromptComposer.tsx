import { Button } from "@/components/ui/Button";
import styles from "./NoteGptWorkspace.module.css";
import { PROMPT_MODES, type PromptModeId } from "./notegpt.types";

interface PromptComposerProps {
  draft: string;
  isStreaming: boolean;
  notesCount: number;
  foldersCount: number;
  activeMode: PromptModeId;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: PromptModeId) => void;
  onSend: () => void;
}

export function PromptComposer({
  draft,
  isStreaming,
  notesCount,
  foldersCount,
  activeMode,
  composerRef,
  onDraftChange,
  onModeChange,
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
            placeholder="NoteGPT'ye mesaj gönder..."
            rows={3}
          />
        </div>

        <div className={styles.composerFooter}>
          <div className={styles.composerMeta}>
            <div className={styles.modeRow} role="list" aria-label="Yanıt modu">
              {PROMPT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`${styles.modeChip} ${
                    activeMode === mode.id ? styles.modeChipActive : ""
                  }`}
                  onClick={() => onModeChange(mode.id)}
                  title={mode.description}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <span className={styles.metaBadge}>
              <span className="material-symbols-outlined sm">account_tree</span>
              {notesCount} not · {foldersCount} klasör bağlı
            </span>
          </div>

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
      <p className={styles.composerHint}>Ctrl/Cmd + Enter ile gönder</p>
    </section>
  );
}
