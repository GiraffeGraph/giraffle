import { generateObject } from "ai";
import {
  Annotation,
  END,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { db } from "@/lib/db";
import { generateId } from "@/lib/utils";
import { resolveAgentModel } from "@/domain/agent/runtime";
import { getLangGraphCheckpointer } from "@/domain/agents/langgraph";
import { persistedBlocksToDocument } from "@/domain/note/block-tree";
import { blocksToMarkdown } from "@/domain/note/note.serializer";
import { archiveNote, relocateNote, updateNote } from "@/domain/note/note.service";
import type { PersistedBlockSource } from "@/domain/note/block-tree";
import type {
  AgentRunStatus,
  ApprovalResume,
  InboxTriageState,
  InboxTriageSummary,
  NoteSnapshot,
  ProposedAction,
  WorkspaceCategory,
  WorkspaceFolder,
} from "./types";
import {
  ApprovalResumeSchema,
  ProposedActionsOutputSchema,
} from "./types";

const NOTE_CONTENT_LIMIT = 3_000;

function overwrite<T>(defaultValue: () => T) {
  return {
    value: (_left: T, right: T) => right,
    default: defaultValue,
  };
}

const InboxTriageAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  userId: Annotation<string>(),
  limit: Annotation<number>(overwrite(() => 20)),
  folders: Annotation<WorkspaceFolder[]>(overwrite<WorkspaceFolder[]>(() => [])),
  categories: Annotation<WorkspaceCategory[]>(overwrite<WorkspaceCategory[]>(() => [])),
  inboxNotes: Annotation<NoteSnapshot[]>(overwrite<NoteSnapshot[]>(() => [])),
  proposedActions: Annotation<ProposedAction[]>(overwrite<ProposedAction[]>(() => [])),
  approvedActionIds: Annotation<string[]>(overwrite<string[]>(() => [])),
  rejectedActionIds: Annotation<string[]>(overwrite<string[]>(() => [])),
  appliedActionIds: Annotation<string[]>(overwrite<string[]>(() => [])),
  status: Annotation<AgentRunStatus>(overwrite<AgentRunStatus>(() => "pending")),
  summary: Annotation<InboxTriageSummary | null>(
    overwrite<InboxTriageSummary | null>(() => null),
  ),
  error: Annotation<string | null>(overwrite<string | null>(() => null)),
});

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

async function recordRunEvent(runId: string, kind: string, payload: unknown = {}) {
  await db.agentRunEvent.create({
    data: {
      runId,
      kind,
      payload: payload as never,
    },
  });
}

async function loadWorkspaceNode(state: InboxTriageState) {
  await db.agentRun.update({
    where: { id: state.runId },
    data: { status: "running", error: null },
  });

  const [folders, categories] = await Promise.all([
    db.folder.findMany({
      where: { userId: state.userId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
    db.noteCategory.findMany({
      where: { userId: state.userId },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true },
    }),
  ]);

  await recordRunEvent(state.runId, "workspace_loaded", {
    folderCount: folders.length,
    categoryCount: categories.length,
  });

  return {
    folders,
    categories,
    status: "running" satisfies AgentRunStatus,
  };
}

async function loadInboxNotesNode(state: InboxTriageState) {
  const notes = await db.note.findMany({
    where: {
      userId: state.userId,
      folderId: null,
      isArchived: false,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: state.limit,
    select: {
      id: true,
      title: true,
      folderId: true,
      categoryId: true,
      updatedAt: true,
      blocks: {
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        select: {
          id: true,
          type: true,
          content: true,
          attributes: true,
          parentId: true,
          position: true,
        },
      },
    },
  });

  const inboxNotes: NoteSnapshot[] = notes.map((note) => {
    const document = persistedBlocksToDocument(
      note.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        attributes: block.attributes,
        parentId: block.parentId,
        position: block.position,
      })) as PersistedBlockSource[],
    );
    const markdown = blocksToMarkdown(document).trim();
    return {
      id: note.id,
      title: note.title,
      content: truncate(markdown || note.title, NOTE_CONTENT_LIMIT),
      folderId: note.folderId,
      categoryId: note.categoryId,
      updatedAt: note.updatedAt.toISOString(),
    };
  });

  if (inboxNotes.length > 0) {
    await db.agentRunNoteSnapshot.createMany({
      data: inboxNotes.map((note) => ({
        runId: state.runId,
        noteId: note.id,
        title: note.title,
        content: note.content,
        folderId: note.folderId,
        categoryId: note.categoryId,
        updatedAt: new Date(note.updatedAt),
      })),
      skipDuplicates: true,
    });
  }

  await db.agentRun.update({
    where: { id: state.runId },
    data: { noteCount: inboxNotes.length },
  });
  await recordRunEvent(state.runId, "inbox_notes_loaded", {
    noteCount: inboxNotes.length,
  });

  return { inboxNotes };
}

function buildProposalPrompt(state: InboxTriageState) {
  return `You are organizing a notes workspace inbox.

Return only useful, conservative triage actions. Prefer existing folders and categories. Do not invent IDs.

Allowed action types:
- MOVE_NOTE: move a note into an existing folder. Requires targetFolderId.
- ASSIGN_CATEGORY: assign an existing category. Requires targetCategoryId.
- ARCHIVE_NOTE: archive stale or clearly low-value notes.
- FLAG_DUPLICATE: flag possible duplicates. Requires duplicateOfNoteId.

Every action must include targetFolderId, targetCategoryId, and duplicateOfNoteId.
Set unused target fields to null.

Do not propose more than two actions per note. Avoid archive unless the note is clearly disposable.

Existing folders:
${JSON.stringify(state.folders)}

Existing categories:
${JSON.stringify(state.categories)}

Inbox notes:
${JSON.stringify(state.inboxNotes)}`;
}

async function proposeActionsNode(state: InboxTriageState) {
  if (state.inboxNotes.length === 0) {
    await recordRunEvent(state.runId, "proposals_generated", { actionCount: 0 });
    return { proposedActions: [] };
  }

  const model = await resolveAgentModel({ userId: state.userId });
  const result = await generateObject({
    model,
    schema: ProposedActionsOutputSchema,
    prompt: buildProposalPrompt(state),
  });

  const proposedActions = result.object.actions.map((action) => ({
    ...action,
    id: generateId(),
    reason: action.reason.trim(),
  }));

  await recordRunEvent(state.runId, "proposals_generated", {
    actionCount: proposedActions.length,
  });

  return {
    proposedActions,
  };
}

function validateActions(state: InboxTriageState): ProposedAction[] {
  const noteById = new Map(state.inboxNotes.map((note) => [note.id, note]));
  const folderIds = new Set(state.folders.map((folder) => folder.id));
  const categoryIds = new Set(state.categories.map((category) => category.id));
  const seen = new Set<string>();
  const out: ProposedAction[] = [];

  for (const action of state.proposedActions) {
    const note = noteById.get(action.noteId);
    if (!note) continue;

    let key = `${action.type}:${action.noteId}`;
    if (action.type === "MOVE_NOTE") {
      if (!action.targetFolderId || !folderIds.has(action.targetFolderId)) continue;
      if (note.folderId === action.targetFolderId) continue;
      key += `:${action.targetFolderId}`;
    }
    if (action.type === "ASSIGN_CATEGORY") {
      if (!action.targetCategoryId || !categoryIds.has(action.targetCategoryId)) continue;
      if (note.categoryId === action.targetCategoryId) continue;
      key += `:${action.targetCategoryId}`;
    }
    if (action.type === "FLAG_DUPLICATE") {
      if (!action.duplicateOfNoteId || action.duplicateOfNoteId === action.noteId) continue;
      if (!noteById.has(action.duplicateOfNoteId)) continue;
      key += `:${action.duplicateOfNoteId}`;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }

  return out;
}

async function validateActionsNode(state: InboxTriageState) {
  const proposedActions = validateActions(state);
  await recordRunEvent(state.runId, "proposals_validated", {
    before: state.proposedActions.length,
    after: proposedActions.length,
  });
  return { proposedActions };
}

async function approvalNode(state: InboxTriageState) {
  if (state.proposedActions.length === 0) {
    await db.agentRun.update({
      where: { id: state.runId },
      data: { status: "applying" },
    });
    return {
      status: "applying" satisfies AgentRunStatus,
      approvedActionIds: [],
      rejectedActionIds: [],
    };
  }

  await db.agentRunAction.createMany({
    data: state.proposedActions.map((action) => ({
      id: action.id,
      runId: state.runId,
      noteId: action.noteId,
      type: action.type,
      status: "pending",
      payload: {
        targetFolderId: action.targetFolderId ?? null,
        targetFolderName:
          state.folders.find((folder) => folder.id === action.targetFolderId)?.name ?? null,
        targetCategoryId: action.targetCategoryId ?? null,
        targetCategoryName:
          state.categories.find((category) => category.id === action.targetCategoryId)?.name ?? null,
        duplicateOfNoteId: action.duplicateOfNoteId ?? null,
        duplicateOfNoteTitle:
          state.inboxNotes.find((note) => note.id === action.duplicateOfNoteId)?.title ?? null,
      },
      reason: action.reason,
    })),
    skipDuplicates: true,
  });
  await db.agentRun.update({
    where: { id: state.runId },
    data: { status: "awaiting_approval" },
  });
  await recordRunEvent(state.runId, "approval_requested", {
    actionCount: state.proposedActions.length,
  });

  const resume = interrupt({
    kind: "inbox_triage_approval",
    runId: state.runId,
    proposedActions: state.proposedActions,
  }) as ApprovalResume;

  const parsed = ApprovalResumeSchema.parse(resume);
  const decisionById = new Map(
    parsed.decisions.map((decision) => [decision.actionId, decision.decision]),
  );
  const approvedActionIds: string[] = [];
  const rejectedActionIds: string[] = [];

  await Promise.all(
    state.proposedActions.map(async (action) => {
      const approved = decisionById.get(action.id) === "approve";
      const status = approved ? "approved" : "rejected";
      if (approved) {
        approvedActionIds.push(action.id);
      } else {
        rejectedActionIds.push(action.id);
      }
      await db.agentRunAction.update({
        where: { id: action.id },
        data: { status },
      });
    }),
  );
  await db.agentRun.update({
    where: { id: state.runId },
    data: { status: "applying" },
  });
  await recordRunEvent(state.runId, "approval_resumed", {
    approvedCount: approvedActionIds.length,
    rejectedCount: rejectedActionIds.length,
  });

  return {
    approvedActionIds,
    rejectedActionIds,
    status: "applying" satisfies AgentRunStatus,
  };
}

async function applyOneApprovedAction(input: {
  userId: string;
  action: {
    id: string;
    noteId: string | null;
    type: string;
    payload: unknown;
  };
}): Promise<"applied" | "skipped"> {
  const { action, userId } = input;
  if (!action.noteId) return "skipped";
  const payload = action.payload as {
    targetFolderId?: string | null;
    targetCategoryId?: string | null;
    duplicateOfNoteId?: string | null;
  };

  if (action.type === "MOVE_NOTE") {
    if (!payload.targetFolderId) return "skipped";
    await relocateNote(userId, action.noteId, { folderId: payload.targetFolderId });
    return "applied";
  }

  if (action.type === "ASSIGN_CATEGORY") {
    if (!payload.targetCategoryId) return "skipped";
    await updateNote(userId, action.noteId, { categoryId: payload.targetCategoryId });
    return "applied";
  }

  if (action.type === "ARCHIVE_NOTE") {
    await archiveNote(userId, action.noteId);
    return "applied";
  }

  if (action.type === "FLAG_DUPLICATE") {
    return payload.duplicateOfNoteId ? "applied" : "skipped";
  }

  return "skipped";
}

async function applyApprovedActionsNode(state: InboxTriageState) {
  const actions = await db.agentRunAction.findMany({
    where: {
      runId: state.runId,
      status: "approved",
      appliedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      noteId: true,
      type: true,
      payload: true,
    },
  });
  const appliedActionIds: string[] = [];

  for (const action of actions) {
    try {
      const result = await applyOneApprovedAction({
        userId: state.userId,
        action,
      });
      await db.agentRunAction.update({
        where: { id: action.id },
        data: {
          status: result,
          appliedAt: result === "applied" ? new Date() : null,
        },
      });
      if (result === "applied") appliedActionIds.push(action.id);
    } catch (error) {
      await db.agentRunAction.update({
        where: { id: action.id },
        data: {
          status: "skipped",
          payload: {
            ...(action.payload as Record<string, unknown>),
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }

  await recordRunEvent(state.runId, "actions_applied", {
    appliedCount: appliedActionIds.length,
  });

  return { appliedActionIds };
}

async function summarizeNode(state: InboxTriageState) {
  const actions = await db.agentRunAction.findMany({
    where: { runId: state.runId },
    select: { type: true, status: true },
  });
  const applied = actions.filter((action) => action.status === "applied");
  const summary: InboxTriageSummary = {
    movedCount: applied.filter((action) => action.type === "MOVE_NOTE").length,
    categorizedCount: applied.filter((action) => action.type === "ASSIGN_CATEGORY").length,
    archivedCount: applied.filter((action) => action.type === "ARCHIVE_NOTE").length,
    duplicateFlagCount: applied.filter((action) => action.type === "FLAG_DUPLICATE").length,
    skippedCount: actions.filter((action) => action.status === "skipped").length,
    summaryText:
      applied.length === 0
        ? "No inbox changes were applied."
        : `Applied ${applied.length} inbox triage action${applied.length === 1 ? "" : "s"}.`,
  };

  await db.agentRun.update({
    where: { id: state.runId },
    data: {
      status: "completed",
      summary: summary.summaryText,
      error: null,
    },
  });
  await recordRunEvent(state.runId, "run_completed", summary);

  return {
    summary,
    status: "completed" satisfies AgentRunStatus,
  };
}

let graphPromise: Promise<ReturnType<ReturnType<typeof buildInboxTriageGraph>["compile"]>> | null =
  null;

function buildInboxTriageGraph() {
  return new StateGraph(InboxTriageAnnotation)
    .addNode("loadWorkspace", loadWorkspaceNode)
    .addNode("loadInboxNotes", loadInboxNotesNode)
    .addNode("proposeActions", proposeActionsNode)
    .addNode("validateActions", validateActionsNode)
    .addNode("approval", approvalNode)
    .addNode("applyApprovedActions", applyApprovedActionsNode)
    .addNode("summarize", summarizeNode)
    .addEdge(START, "loadWorkspace")
    .addEdge("loadWorkspace", "loadInboxNotes")
    .addEdge("loadInboxNotes", "proposeActions")
    .addEdge("proposeActions", "validateActions")
    .addEdge("validateActions", "approval")
    .addEdge("approval", "applyApprovedActions")
    .addEdge("applyApprovedActions", "summarize")
    .addEdge("summarize", END);
}

export async function getInboxTriageGraph() {
  graphPromise ??= (async () => {
    const checkpointer = await getLangGraphCheckpointer();
    return buildInboxTriageGraph().compile({ checkpointer });
  })();

  return graphPromise;
}
