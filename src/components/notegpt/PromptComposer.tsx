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
    <section className={styles.composerSection}>
      <div className={styles.composerPanel}>
        <div className={styles.modeRow}>
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
            placeholder="NoteGPT'ye bir soru sor ya da bir görev ver..."
            rows={5}
          />
        </div>

        <div className={styles.composerFooter}>
          <div className={styles.composerMeta}>
            <span className={styles.metaBadge}>
              <span className="material-symbols-outlined sm">account_tree</span>
              {notesCount} not · {foldersCount} klasör bağlı
            </span>
            <span className={styles.composerHint}>Ctrl/Cmd + Enter</span>
          </div>

          <Button
            variant="filled"
            leadingIcon="arrow_upward"
            onClick={onSend}
            disabled={!draft.trim() || isStreaming}
          >
            {isStreaming ? "Yanıtlanıyor..." : "Gönder"}
          </Button>
        </div>
      </div>
    </section>
  );
}
