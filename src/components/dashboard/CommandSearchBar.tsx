"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./CommandSearchBar.module.css";
import {
  applyWorkspaceCommandSuggestion,
  getWorkspaceCommandSuggestions,
  resolveWorkspaceCommandInput,
  WORKSPACE_COMMANDS,
} from "@/lib/workspace-command-bar";

const EXAMPLE_QUERIES = [
  "/spotter Haftalık planımı toparla",
  "/search bütçe toplantısı",
  "/search /roadmap|plan/i",
] as const;

export function CommandSearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  const suggestions = useMemo(
    () => getWorkspaceCommandSuggestions(value),
    [value],
  );

  const activeSuggestion = suggestions[activeSuggestionIndex] ?? null;
  const shouldShowSuggestions = isFocused && suggestions.length > 0;
  const resolution = useMemo(() => resolveWorkspaceCommandInput(value), [value]);

  const execute = (input: string) => {
    const next = resolveWorkspaceCommandInput(input);

    if (next.kind === "empty") {
      return;
    }

    router.push(next.href);
  };

  return (
    <section className={styles.shell}>
      <div className={styles.backgroundGradient} aria-hidden="true" />
      <div className={styles.content}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            execute(value);
          }}
        >
          <label className={styles.inputWrap}>
            <span className={`material-symbols-outlined ${styles.inputIcon}`} aria-hidden="true">
              travel_explore
            </span>
            <input
              value={value}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  setIsFocused(false);
                }, 120);
              }}
              onChange={(event) => {
                setValue(event.target.value);
                setActiveSuggestionIndex(0);
              }}
              onKeyDown={(event) => {
                if (!shouldShowSuggestions) {
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSuggestionIndex((current) =>
                    (current + 1) % suggestions.length,
                  );
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSuggestionIndex((current) =>
                    (current - 1 + suggestions.length) % suggestions.length,
                  );
                  return;
                }

                if (event.key === "Tab" && activeSuggestion) {
                  event.preventDefault();
                  setValue((current) =>
                    applyWorkspaceCommandSuggestion(current, activeSuggestion),
                  );
                }
              }}
              className={styles.input}
              placeholder="/spotter veya /search ..."
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Workspace command input"
            />
            <button type="submit" className={styles.submitButton}>
              Çalıştır
            </button>
          </label>

          {shouldShowSuggestions ? (
            <ul className={styles.suggestionList} role="listbox" aria-label="Command suggestions">
              {suggestions.map((suggestion, index) => {
                const isActive = index === activeSuggestionIndex;

                return (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      className={`${styles.suggestionItem} ${isActive ? styles.suggestionItemActive : ""}`}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => {
                        setValue((current) =>
                          applyWorkspaceCommandSuggestion(current, suggestion),
                        );
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {suggestion.icon}
                      </span>
                      <span className={styles.suggestionCopy}>
                        <strong>{suggestion.primaryTrigger}</strong>
                        <small>{suggestion.description}</small>
                      </span>
                      <span className={styles.suggestionAliases}>
                        {suggestion.aliases.join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </form>

        <div className={styles.footerRow}>
          <span className={styles.routePill}>
            <span className="material-symbols-outlined" aria-hidden="true">
              route
            </span>
            {resolution.kind === "command"
              ? `/${resolution.commandId}`
              : resolution.kind === "prompt"
                ? "spotter"
                : "ready"}
          </span>
          <span className={styles.routeHint}>Enter · Tab</span>
        </div>

        <div className={styles.examples}>
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              type="button"
              className={styles.exampleChip}
              onClick={() => {
                setValue(example);
                execute(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>

        <div className={styles.commandLegend}>
          {WORKSPACE_COMMANDS.map((command) => (
            <button
              key={command.id}
              type="button"
              className={styles.commandChip}
              onClick={() => setValue(`${command.primaryTrigger} `)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {command.icon}
              </span>
              {command.primaryTrigger}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
