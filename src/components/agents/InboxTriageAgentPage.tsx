"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageTopbar } from "@/components/ui/PageTopbar";
import styles from "./InboxTriageAgentPage.module.css";

interface AgentRunActionView {
  id: string;
  noteId: string | null;
  noteTitle: string | null;
  type: string;
  status: string;
  payload: {
    targetFolderName?: string | null;
    targetCategoryName?: string | null;
    duplicateOfNoteTitle?: string | null;
  };
  reason: string;
  appliedAt: string | null;
}

interface InboxTriageRunView {
  run: {
    id: string;
    status: string;
    noteCount: number | null;
    summary: string | null;
    error: string | null;
  };
  actions: AgentRunActionView[];
}

function actionTitle(action: AgentRunActionView) {
  if (action.type === "MOVE_NOTE") {
    return `Move to ${action.payload.targetFolderName ?? "folder"}`;
  }
  if (action.type === "ASSIGN_CATEGORY") {
    return `Set category ${action.payload.targetCategoryName ?? "category"}`;
  }
  if (action.type === "ARCHIVE_NOTE") {
    return "Archive note";
  }
  if (action.type === "FLAG_DUPLICATE") {
    return `Flag duplicate of ${action.payload.duplicateOfNoteTitle ?? "another note"}`;
  }
  return action.type;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function InboxTriageAgentPage() {
  const [runView, setRunView] = useState<InboxTriageRunView | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingActions = useMemo(
    () => runView?.actions.filter((action) => action.status === "pending") ?? [],
    [runView],
  );
  const approvedCount = Object.values(decisions).filter(Boolean).length;

  async function startRun() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/inbox-triage/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      if (!response.ok) throw new Error(await response.text());
      const next = (await response.json()) as InboxTriageRunView;
      setRunView(next);
      setDecisions(
        Object.fromEntries(
          next.actions
            .filter((action) => action.status === "pending")
            .map((action) => [action.id, action.type !== "ARCHIVE_NOTE"]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inbox triage failed");
    } finally {
      setBusy(false);
    }
  }

  async function resumeRun() {
    if (!runView) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/runs/${runView.run.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions: pendingActions.map((action) => ({
            actionId: action.id,
            decision: decisions[action.id] ? "approve" : "reject",
          })),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setRunView((await response.json()) as InboxTriageRunView);
      setDecisions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inbox triage resume failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageTopbar
        icon="rule"
        label="Inbox Triage"
        meta={runView ? statusLabel(runView.run.status) : "LangGraph agent"}
        actions={
          <Button
            type="button"
            variant="filled"
            leadingIcon="play_arrow"
            onClick={startRun}
            disabled={busy}
          >
            Run
          </Button>
        }
      />

      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1>Inbox Triage</h1>
            <p>Review proposed moves, categories, archive decisions, and duplicate flags before anything changes.</p>
          </div>
          <div className={styles.metric}>
            <span>{runView?.run.noteCount ?? 0}</span>
            <small>notes scanned</small>
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Proposals</h2>
              {pendingActions.length > 0 ? (
                <Button type="button" variant="tonal" leadingIcon="done_all" onClick={resumeRun} disabled={busy}>
                  Apply {approvedCount}
                </Button>
              ) : null}
            </div>

            {runView ? (
              <div className={styles.actionList}>
                {runView.actions.length === 0 ? (
                  <p className={styles.empty}>No triage actions were proposed.</p>
                ) : (
                  runView.actions.map((action) => (
                    <article key={action.id} className={styles.action}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={Boolean(decisions[action.id])}
                          disabled={action.status !== "pending" || busy}
                          onChange={(event) =>
                            setDecisions((current) => ({
                              ...current,
                              [action.id]: event.target.checked,
                            }))
                          }
                        />
                        <span />
                      </label>
                      <div className={styles.actionBody}>
                        <div className={styles.actionTopline}>
                          <strong>{action.noteTitle ?? "Missing note"}</strong>
                          <em>{statusLabel(action.status)}</em>
                        </div>
                        <h3>{actionTitle(action)}</h3>
                        <p>{action.reason}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span className="material-symbols-outlined" aria-hidden="true">inventory_2</span>
                <p>Start a run to scan up to 20 inbox notes.</p>
              </div>
            )}
          </section>

          <aside className={styles.panel}>
            <h2>Run Summary</h2>
            <div className={styles.summary}>
              <div>
                <span>Status</span>
                <strong>{runView ? statusLabel(runView.run.status) : "idle"}</strong>
              </div>
              <div>
                <span>Pending</span>
                <strong>{pendingActions.length}</strong>
              </div>
              <div>
                <span>Approved</span>
                <strong>{approvedCount}</strong>
              </div>
            </div>
            {runView?.run.summary ? <p className={styles.summaryText}>{runView.run.summary}</p> : null}
            {runView?.run.error ? <p className={styles.error}>{runView.run.error}</p> : null}
          </aside>
        </div>
      </section>
    </main>
  );
}
