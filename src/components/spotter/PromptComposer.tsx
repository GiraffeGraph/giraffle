import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SPOTTER_COMMANDS } from "@/domain/spotter-commands/catalog";
import styles from "./SpotterWorkspace.module.css";

export type ComposerToolIntent = "web_search";

interface PromptComposerProps {
  draft: string;
  isStreaming: boolean;
  notesCount: number;
  foldersCount: number;
  selectedToolIntent: ComposerToolIntent | null;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onToolIntentChange: (value: ComposerToolIntent | null) => void;
  onSend: () => void;
}

function getSlashQuery(draft: string): string | null {
  if (!draft.startsWith("/") || draft.includes("\n")) return null;
  const first = draft.slice(1).split(/\s+/, 1)[0] ?? "";
  if (draft.includes(" ")) return null;
  return first.toLowerCase();
}

export function PromptComposer({
  draft,
  isStreaming,
  notesCount,
  foldersCount,
  selectedToolIntent,
  composerRef,
  onDraftChange,
  onToolIntentChange,
  onSend,
}: PromptComposerProps) {
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const slashQuery = getSlashQuery(draft);
  const commandMatches = useMemo(() => {
    if (slashQuery === null) return [];
    const visible = SPOTTER_COMMANDS.filter((command) => !command.hidden);
    if (!slashQuery) return visible.slice(0, 8);
    return visible
      .filter((command) => {
        const haystack = [
          command.name,
          ...(command.aliases ?? []),
          command.description,
          command.category,
        ].join(" ").toLowerCase();
        return haystack.includes(slashQuery);
      })
      .slice(0, 8);
  }, [slashQuery]);

  return (
    <section className={styles.composerSection} aria-label="Write message">
      {toolMenuOpen && commandMatches.length === 0 && (
        <div className={styles.toolMenu} role="menu" aria-label="Spotter tools">
          <button
            type="button"
            className={styles.toolMenuItem}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onToolIntentChange(selectedToolIntent === "web_search" ? null : "web_search");
              setToolMenuOpen(false);
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">language</span>
            <span>
              <strong>Web search</strong>
              <small>Force Spotter to search connected Trails first</small>
            </span>
          </button>
          <button type="button" className={styles.toolMenuItem} disabled>
            <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>
            <span>
              <strong>Deep research</strong>
              <small>Coming later</small>
            </span>
          </button>
        </div>
      )}
      {commandMatches.length > 0 && (
        <div className={styles.commandMenu} role="listbox" aria-label="Slash commands">
          {commandMatches.map((command) => (
            <button
              key={command.name}
              type="button"
              className={styles.commandMenuItem}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onDraftChange(`/${command.name} `)}
            >
              <span className={styles.commandMenuName}>
                /{command.name}
                {command.argumentHint ? <em> {command.argumentHint}</em> : null}
              </span>
              <span className={styles.commandMenuDescription}>{command.description}</span>
            </button>
          ))}
        </div>
      )}
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
            placeholder={selectedToolIntent === "web_search" ? "Search the web" : "Ask Spotter or type /..."}
            rows={3}
          />
        </div>

        <div className={styles.composerFooter}>
          <div className={styles.composerContext}>
            <button
              type="button"
              className={`${styles.composerToolButton} ${toolMenuOpen ? styles.composerToolButtonActive : ""}`}
              onClick={() => setToolMenuOpen((open) => !open)}
              disabled={isStreaming}
              aria-label="Open tools"
              aria-expanded={toolMenuOpen}
            >
              <span className="material-symbols-outlined sm" aria-hidden="true">add</span>
            </button>
            {selectedToolIntent === "web_search" && (
              <button
                type="button"
                className={styles.selectedToolChip}
                onClick={() => onToolIntentChange(null)}
                disabled={isStreaming}
                aria-label="Disable web search"
              >
                <span className="material-symbols-outlined sm" aria-hidden="true">language</span>
                Search
              </button>
            )}
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
            <span className={styles.composerHintInline}>Enter to send · Shift+Enter newline · / commands</span>
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
