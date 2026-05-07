import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { db } from "@/lib/db";
import { generateId } from "@/lib/utils";
import { getInboxTriageGraph } from "./graph";
import {
  DEFAULT_INBOX_TRIAGE_LIMIT,
  INBOX_TRIAGE_AGENT_TYPE,
  type ApprovalDecision,
  type InboxTriageState,
} from "./types";

export interface InboxTriageRunView {
  run: {
    id: string;
    type: string;
    status: string;
    noteCount: number | null;
    summary: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
  };
  actions: Array<{
    id: string;
    noteId: string | null;
    noteTitle: string | null;
    type: string;
    status: string;
    payload: unknown;
    reason: string;
    appliedAt: string | null;
  }>;
  events: Array<{
    id: string;
    kind: string;
    payload: unknown;
    createdAt: string;
  }>;
  interrupt: unknown;
}

function toRunView(input: {
  run: Awaited<ReturnType<typeof loadOwnedRun>>;
  interrupt?: unknown;
}): InboxTriageRunView {
  const { run } = input;
  return {
    run: {
      id: run.id,
      type: run.type,
      status: run.status,
      noteCount: run.noteCount,
      summary: run.summary,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    },
    actions: run.actions.map((action) => ({
      id: action.id,
      noteId: action.noteId,
      noteTitle: action.note?.title ?? null,
      type: action.type,
      status: action.status,
      payload: action.payload,
      reason: action.reason,
      appliedAt: action.appliedAt?.toISOString() ?? null,
    })),
    events: run.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    })),
    interrupt: input.interrupt ?? null,
  };
}

async function loadOwnedRun(userId: string, runId: string) {
  const run = await db.agentRun.findFirst({
    where: {
      id: runId,
      userId,
      type: INBOX_TRIAGE_AGENT_TYPE,
    },
    include: {
      actions: {
        orderBy: { createdAt: "asc" },
        include: {
          note: {
            select: { title: true },
          },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
  });

  if (!run) {
    throw new Error("Agent run not found");
  }

  return run;
}

function extractInterrupt(result: unknown): unknown {
  if (!isInterrupted(result)) return null;
  return result[INTERRUPT].map((entry) => entry.value);
}

export async function getInboxTriageRun(userId: string, runId: string) {
  return toRunView({ run: await loadOwnedRun(userId, runId) });
}

export async function startInboxTriageRun(input: {
  userId: string;
  limit?: number;
}): Promise<InboxTriageRunView> {
  const limit = input.limit ?? DEFAULT_INBOX_TRIAGE_LIMIT;
  const run = await db.agentRun.create({
    data: {
      userId: input.userId,
      type: INBOX_TRIAGE_AGENT_TYPE,
      status: "pending",
      threadId: generateId(),
    },
  });
  const graph = await getInboxTriageGraph();
  const config = { configurable: { thread_id: run.threadId } };
  const initialState: InboxTriageState = {
    runId: run.id,
    userId: input.userId,
    limit,
    folders: [],
    categories: [],
    inboxNotes: [],
    proposedActions: [],
    approvedActionIds: [],
    rejectedActionIds: [],
    appliedActionIds: [],
    status: "pending",
    summary: null,
    error: null,
  };

  try {
    const result = await graph.invoke(initialState, config);
    const latest = await loadOwnedRun(input.userId, run.id);
    return toRunView({
      run: latest,
      interrupt: extractInterrupt(result),
    });
  } catch (error) {
    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function resumeInboxTriageRun(input: {
  userId: string;
  runId: string;
  decisions: ApprovalDecision[];
}): Promise<InboxTriageRunView> {
  const run = await loadOwnedRun(input.userId, input.runId);
  if (run.status !== "awaiting_approval") {
    throw new Error("Agent run is not awaiting approval");
  }

  const graph = await getInboxTriageGraph();
  const config = { configurable: { thread_id: run.threadId } };

  try {
    const result = await graph.invoke(
      new Command({
        resume: { decisions: input.decisions },
      }),
      config,
    );
    const latest = await loadOwnedRun(input.userId, input.runId);
    return toRunView({
      run: latest,
      interrupt: extractInterrupt(result),
    });
  } catch (error) {
    await db.agentRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
